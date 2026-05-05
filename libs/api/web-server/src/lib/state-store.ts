import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { createClient, type RedisClientOptions } from '@redis/client';
import { createConsoleLogger } from '@acme-los/core/logger';

type WebStateStoreMode = 'file' | 'redis';
type RedisAuthMode = 'connection-string' | 'entra';

type PersistedStateRecord<T> = {
  expiresAt: number;
  value: T;
};

type RedisClient = ReturnType<typeof createClient>;

const logger = createConsoleLogger();
let redisClientPromise: Promise<RedisClient> | null = null;

function getConfiguredStoreMode(): WebStateStoreMode {
  const requestedMode = process.env.ACME_WEB_STATE_STORE?.trim().toLowerCase();

  if (requestedMode === 'redis') {
    return 'redis';
  }

  if (requestedMode === 'file') {
    return 'file';
  }

  if (process.env.ACME_REDIS_URL?.trim()) {
    return 'redis';
  }

  if (process.env.ACME_REDIS_HOST?.trim()) {
    return 'redis';
  }

  return 'file';
}

function getRedisAuthMode(): RedisAuthMode {
  const requestedMode = process.env.ACME_REDIS_AUTH_MODE?.trim().toLowerCase();

  if (!requestedMode) {
    return process.env.ACME_REDIS_HOST?.trim() ? 'entra' : 'connection-string';
  }

  if (requestedMode === 'entra') {
    return 'entra';
  }

  if (requestedMode === 'connection-string') {
    return 'connection-string';
  }

  throw new Error(
    `Unsupported Redis authentication mode '${requestedMode}'. Use 'entra' or 'connection-string'.`,
  );
}

function getRedisUrl(): string {
  return process.env.ACME_REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
}

function getRedisHostName(): string {
  const hostName = process.env.ACME_REDIS_HOST?.trim();

  if (!hostName) {
    throw new Error(
      'ACME_REDIS_HOST must be set when Redis Entra auth is used.',
    );
  }

  return hostName;
}

function getRedisPort(): number {
  const rawPort = process.env.ACME_REDIS_PORT?.trim();

  if (!rawPort) {
    return 10000;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('ACME_REDIS_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function getRedisManagedIdentityClientId(): string | undefined {
  return (
    process.env.ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID?.trim() ||
    process.env.AZURE_CLIENT_ID?.trim() ||
    undefined
  );
}

function getRedisEndpointUrl(): string {
  return `rediss://${getRedisHostName()}:${getRedisPort()}`;
}

function getRedisKeyPrefix(): string {
  return process.env.ACME_REDIS_KEY_PREFIX?.trim() || 'acme-los:web';
}

function getFileStoreDirectory(): string {
  return join(process.cwd(), '.next', 'cache', 'acme-los-web-state');
}

function getFileStoreNamespaceDirectory(namespace: string): string {
  return join(getFileStoreDirectory(), namespace);
}

function ensureFileStoreDirectory(namespace: string): void {
  const namespaceDirectory = getFileStoreNamespaceDirectory(namespace);

  if (!existsSync(namespaceDirectory)) {
    mkdirSync(namespaceDirectory, { recursive: true });
  }
}

function getFilePath(namespace: string, key: string): string {
  return join(
    getFileStoreNamespaceDirectory(namespace),
    `${encodeURIComponent(key)}.json`,
  );
}

function createRedisKey(namespace: string, key: string): string {
  return `${getRedisKeyPrefix()}:${namespace}:${key}`;
}

async function createRedisClientOptions(): Promise<RedisClientOptions> {
  const authMode = getRedisAuthMode();
  const options: RedisClientOptions = {
    url: authMode === 'entra' ? getRedisEndpointUrl() : getRedisUrl(),
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 100, 1000),
    },
  };

  if (authMode === 'entra') {
    const { EntraIdCredentialsProviderFactory, REDIS_SCOPE_DEFAULT } =
      await import('@redis/entraid');
    const managedIdentityClientId = getRedisManagedIdentityClientId();
    const credential = new DefaultAzureCredential(
      managedIdentityClientId
        ? {
            managedIdentityClientId,
            workloadIdentityClientId: managedIdentityClientId,
          }
        : undefined,
    );

    options.credentialsProvider =
      EntraIdCredentialsProviderFactory.createForDefaultAzureCredential({
        credential,
        scopes: REDIS_SCOPE_DEFAULT,
        tokenManagerConfig: {
          expirationRefreshRatio: 0.8,
        },
        onRetryableError: (error) => {
          logger.warn('Retryable Redis Entra auth error', {
            error,
          });
        },
        onReAuthenticationError: (error) => {
          logger.error('Redis Entra reauthentication failed', {
            error: error.message,
          });
        },
      });
  }

  return options;
}

async function getRedisClient(): Promise<RedisClient> {
  if (!redisClientPromise) {
    const client = createClient(await createRedisClientOptions());

    redisClientPromise = client
      .connect()
      .then(() => client)
      .catch((error) => {
        redisClientPromise = null;
        client.destroy();
        throw error;
      });
  }

  return redisClientPromise;
}

function readFileRecord<T>(
  namespace: string,
  key: string,
): PersistedStateRecord<T> | null {
  const filePath = getFilePath(namespace, key);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(
      readFileSync(filePath, 'utf8'),
    ) as PersistedStateRecord<T>;
  } catch {
    unlinkSync(filePath);
    return null;
  }
}

function pruneExpiredFileRecords(namespace: string): void {
  const namespaceDirectory = getFileStoreNamespaceDirectory(namespace);
  if (!existsSync(namespaceDirectory)) {
    return;
  }

  const currentEpochMilliseconds = Date.now();

  for (const fileName of readdirSync(namespaceDirectory)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const key = decodeURIComponent(fileName.slice(0, -'.json'.length));
    const record = readFileRecord(namespace, key);

    if (!record || record.expiresAt <= currentEpochMilliseconds) {
      const filePath = getFilePath(namespace, key);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  }
}

async function readFileStateValue<T>(
  namespace: string,
  key: string,
): Promise<T | null> {
  pruneExpiredFileRecords(namespace);

  const record = readFileRecord<T>(namespace, key);
  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    const filePath = getFilePath(namespace, key);

    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    return null;
  }

  return record.value;
}

async function writeFileStateValue<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  ensureFileStoreDirectory(namespace);
  const record: PersistedStateRecord<T> = {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value,
  };

  writeFileSync(getFilePath(namespace, key), JSON.stringify(record), 'utf8');
}

async function deleteFileStateValue(
  namespace: string,
  key: string,
): Promise<void> {
  const filePath = getFilePath(namespace, key);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

async function readRedisStateValue<T>(
  namespace: string,
  key: string,
): Promise<T | null> {
  const client = await getRedisClient();
  const rawValue = await client.get(createRedisKey(namespace, key));

  if (!rawValue) {
    return null;
  }

  try {
    const record = JSON.parse(
      Buffer.isBuffer(rawValue) ? rawValue.toString('utf8') : rawValue,
    ) as PersistedStateRecord<T>;

    if (record.expiresAt <= Date.now()) {
      await client.del(createRedisKey(namespace, key));
      return null;
    }

    return record.value;
  } catch {
    await client.del(createRedisKey(namespace, key));
    return null;
  }
}

async function writeRedisStateValue<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const client = await getRedisClient();
  const record: PersistedStateRecord<T> = {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value,
  };

  await client.set(createRedisKey(namespace, key), JSON.stringify(record), {
    EX: Math.max(ttlSeconds, 1),
  });
}

async function deleteRedisStateValue(
  namespace: string,
  key: string,
): Promise<void> {
  const client = await getRedisClient();
  await client.del(createRedisKey(namespace, key));
}

export async function readStateValue<T>(
  namespace: string,
  key: string,
): Promise<T | null> {
  if (getConfiguredStoreMode() === 'redis') {
    return readRedisStateValue(namespace, key);
  }

  return readFileStateValue(namespace, key);
}

export async function writeStateValue<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (getConfiguredStoreMode() === 'redis') {
    await writeRedisStateValue(namespace, key, value, ttlSeconds);
    return;
  }

  await writeFileStateValue(namespace, key, value, ttlSeconds);
}

export async function deleteStateValue(
  namespace: string,
  key: string,
): Promise<void> {
  if (getConfiguredStoreMode() === 'redis') {
    await deleteRedisStateValue(namespace, key);
    return;
  }

  await deleteFileStateValue(namespace, key);
}

export function getWebStateStoreMode(): WebStateStoreMode {
  return getConfiguredStoreMode();
}

export function getWebRedisAuthMode(): RedisAuthMode {
  return getRedisAuthMode();
}

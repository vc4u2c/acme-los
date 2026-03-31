import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createClient } from 'redis';

type WebStateStoreMode = 'file' | 'redis';

type PersistedStateRecord<T> = {
  expiresAt: number;
  value: T;
};

type RedisClient = ReturnType<typeof createClient>;

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

  return 'file';
}

function getRedisUrl(): string {
  return process.env.ACME_REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
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

async function getRedisClient(): Promise<RedisClient> {
  if (!redisClientPromise) {
    const client = createClient({
      url: getRedisUrl(),
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 1000),
      },
    });

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
    const record = JSON.parse(rawValue) as PersistedStateRecord<T>;

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

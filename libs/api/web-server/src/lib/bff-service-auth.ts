import { DefaultAzureCredential } from '@azure/identity';

export const BFF_SERVICE_AUTH_MODE_ENV_NAME = 'ACME_BFF_SERVICE_AUTH_MODE';
export const BFF_SERVICE_AUTH_SCOPE_ENV_NAME = 'ACME_BFF_SERVICE_AUTH_SCOPE';
export const BFF_SERVICE_AUTH_MANAGED_IDENTITY_CLIENT_ID_ENV_NAME =
  'ACME_BFF_SERVICE_AUTH_MANAGED_IDENTITY_CLIENT_ID';

export type BffServiceAuthMode = 'disabled' | 'entra';

type AccessToken = {
  token: string;
  expiresOnTimestamp: number;
};

type TokenCredential = {
  getToken(scope: string): Promise<AccessToken | null>;
};

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

let credentialCacheKey: string | null = null;
let credential: TokenCredential | null = null;
let cachedToken: { scope: string; token: AccessToken } | null = null;
let tokenPromise: Promise<AccessToken> | null = null;

function trimValue(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBffServiceAuthMode(): BffServiceAuthMode {
  const configuredMode = trimValue(process.env[BFF_SERVICE_AUTH_MODE_ENV_NAME]);

  if (!configuredMode) {
    return 'disabled';
  }

  const normalizedMode = configuredMode.toLowerCase();

  if (
    normalizedMode === 'disabled' ||
    normalizedMode === 'off' ||
    normalizedMode === 'none'
  ) {
    return 'disabled';
  }

  if (normalizedMode === 'entra') {
    return 'entra';
  }

  throw new Error(
    `Unsupported ${BFF_SERVICE_AUTH_MODE_ENV_NAME} value "${configuredMode}". Use "disabled" or "entra".`,
  );
}

export function getBffServiceTokenScopeOrThrow(): string {
  const scope = trimValue(process.env[BFF_SERVICE_AUTH_SCOPE_ENV_NAME]);

  if (!scope) {
    throw new Error(
      `Set ${BFF_SERVICE_AUTH_SCOPE_ENV_NAME} when ${BFF_SERVICE_AUTH_MODE_ENV_NAME}=entra.`,
    );
  }

  return scope;
}

function getBffServiceManagedIdentityClientId(): string | undefined {
  return (
    trimValue(
      process.env[BFF_SERVICE_AUTH_MANAGED_IDENTITY_CLIENT_ID_ENV_NAME],
    ) ??
    trimValue(process.env.AZURE_CLIENT_ID) ??
    undefined
  );
}

function getCredential(): TokenCredential {
  const managedIdentityClientId = getBffServiceManagedIdentityClientId();
  const cacheKey = managedIdentityClientId ?? '';

  if (!credential || credentialCacheKey !== cacheKey) {
    credential = new DefaultAzureCredential(
      managedIdentityClientId
        ? {
            managedIdentityClientId,
            workloadIdentityClientId: managedIdentityClientId,
          }
        : undefined,
    );
    credentialCacheKey = cacheKey;
  }

  return credential;
}

function getCachedAccessToken(scope: string): AccessToken | null {
  return cachedToken?.scope === scope &&
    cachedToken.token.expiresOnTimestamp > Date.now() + TOKEN_REFRESH_SKEW_MS
    ? cachedToken.token
    : null;
}

async function getBffServiceAccessToken(scope: string): Promise<AccessToken> {
  const cachedAccessToken = getCachedAccessToken(scope);

  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  if (!tokenPromise) {
    tokenPromise = getCredential()
      .getToken(scope)
      .then((token) => {
        if (!token?.token) {
          throw new Error(
            'Managed identity did not return a BFF service token.',
          );
        }

        cachedToken = {
          scope,
          token,
        };

        return token;
      })
      .finally(() => {
        tokenPromise = null;
      });
  }

  return tokenPromise;
}

export async function getBffServiceAuthorizationHeader(): Promise<
  string | null
> {
  if (getBffServiceAuthMode() !== 'entra') {
    return null;
  }

  const token = await getBffServiceAccessToken(
    getBffServiceTokenScopeOrThrow(),
  );

  return `Bearer ${token.token}`;
}

export function resetBffServiceAuthCacheForTests(): void {
  credentialCacheKey = null;
  credential = null;
  cachedToken = null;
  tokenPromise = null;
}

export const BFF_PROXY_MODE_ENV_NAME = 'ACME_BFF_PROXY_MODE';
export const BFF_TRUSTED_PROXY_SECRET_HEADER = 'x-acme-bff-proxy-secret';

const BFF_BASE_URL_ENV_NAMES = ['ACME_BFF_BASE_URL', 'ACME_BFF_URL'] as const;
const BFF_TRUSTED_PROXY_SECRET_ENV_NAME = 'ACME_BFF_TRUSTED_PROXY_SECRET';

export type BffProxyMode = 'next' | 'bff';

function trimValue(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBffProxyMode(): BffProxyMode {
  const configuredMode = trimValue(process.env[BFF_PROXY_MODE_ENV_NAME]);

  if (!configuredMode) {
    return 'next';
  }

  const normalizedMode = configuredMode.toLowerCase();

  if (normalizedMode === 'next' || normalizedMode === 'bff') {
    return normalizedMode;
  }

  throw new Error(
    `Unsupported ${BFF_PROXY_MODE_ENV_NAME} value "${configuredMode}". Use "next" or "bff".`,
  );
}

export function isBffProxyEnabled(): boolean {
  return getBffProxyMode() === 'bff';
}

export function getBffBaseUrl(): string | null {
  for (const envName of BFF_BASE_URL_ENV_NAMES) {
    const value = trimValue(process.env[envName]);
    if (value) {
      return value;
    }
  }

  return null;
}

export function getBffBaseUrlOrThrow(): string {
  const baseUrl = getBffBaseUrl();

  if (!baseUrl) {
    throw new Error(
      `Set ACME_BFF_BASE_URL or ACME_BFF_URL when ${BFF_PROXY_MODE_ENV_NAME}=bff.`,
    );
  }

  return baseUrl;
}

export function getBffTrustedProxySecret(): string | null {
  return trimValue(process.env[BFF_TRUSTED_PROXY_SECRET_ENV_NAME]);
}

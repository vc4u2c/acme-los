export const BFF_TRUSTED_PROXY_SECRET_HEADER = 'x-acme-bff-proxy-secret';

const BFF_BASE_URL_ENV_NAMES = ['ACME_BFF_BASE_URL', 'ACME_BFF_URL'] as const;
const BFF_TRUSTED_PROXY_SECRET_ENV_NAME = 'ACME_BFF_TRUSTED_PROXY_SECRET';

function trimValue(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
      'Set ACME_BFF_BASE_URL or ACME_BFF_URL for the Next-to-BFF facade.',
    );
  }

  return baseUrl;
}

export function getBffTrustedProxySecret(): string | null {
  return trimValue(process.env[BFF_TRUSTED_PROXY_SECRET_ENV_NAME]);
}

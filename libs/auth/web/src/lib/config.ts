import type { AuthProviderKind } from '@acme-los/auth/contracts';

export type WebAuthProviderMode = AuthProviderKind;

export interface WebAuthConfig {
  provider: WebAuthProviderMode;
  configurationError?: string;
}

function trimValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getWebAuthConfig(): WebAuthConfig {
  const requestedProvider = trimValue(process.env.NEXT_PUBLIC_AUTH_PROVIDER);

  if (requestedProvider === 'mock') {
    return { provider: 'mock' };
  }

  if (requestedProvider && requestedProvider !== 'okta') {
    return {
      provider: 'okta',
      configurationError:
        'Set NEXT_PUBLIC_AUTH_PROVIDER=okta for the real IDX auth flow or NEXT_PUBLIC_AUTH_PROVIDER=mock only for explicit test/demo scenarios.',
    };
  }

  return { provider: 'okta' };
}

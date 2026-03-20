import type { AuthProviderKind } from '@acme-los/auth/contracts';

export type WebAuthProviderMode = AuthProviderKind;

export interface OktaBrowserAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  fundingStepUpAcrValues: string;
}

export interface WebAuthConfig {
  provider: WebAuthProviderMode;
  okta?: OktaBrowserAuthConfig;
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

  if (requestedProvider !== 'okta') {
    if (process.env.NODE_ENV === 'production') {
      return {
        provider: 'okta',
        configurationError:
          'Set NEXT_PUBLIC_AUTH_PROVIDER=okta and provide the required NEXT_PUBLIC_OKTA_* values before deploying.',
      };
    }

    return { provider: 'mock' };
  }

  const issuer = trimValue(process.env.NEXT_PUBLIC_OKTA_ISSUER);
  const clientId = trimValue(process.env.NEXT_PUBLIC_OKTA_CLIENT_ID);
  const redirectUri = trimValue(process.env.NEXT_PUBLIC_OKTA_REDIRECT_URI);
  const postLogoutRedirectUri = trimValue(
    process.env.NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI,
  );

  if (!issuer || !clientId || !redirectUri || !postLogoutRedirectUri) {
    return {
      provider: 'okta',
      configurationError:
        'Okta auth is enabled, but one or more required NEXT_PUBLIC_OKTA_* values are missing.',
    };
  }

  return {
    provider: 'okta',
    okta: {
      issuer,
      clientId,
      redirectUri,
      postLogoutRedirectUri,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      fundingStepUpAcrValues:
        trimValue(process.env.NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES) ??
        'urn:okta:loa:2fa:any',
    },
  };
}

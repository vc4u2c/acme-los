export type WebAuthProviderMode = 'mock' | 'okta';

export interface OktaServerAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  fundingStepUpAcrValues: string;
}

export interface ServerWebAuthConfig {
  provider: WebAuthProviderMode;
  okta?: OktaServerAuthConfig;
  configurationError?: string;
}

function trimValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getServerWebAuthConfig(): ServerWebAuthConfig {
  const requestedProvider = trimValue(process.env.NEXT_PUBLIC_AUTH_PROVIDER);

  if (requestedProvider === 'mock') {
    return { provider: 'mock' };
  }

  if (requestedProvider && requestedProvider !== 'okta') {
    return {
      provider: 'okta',
      configurationError:
        'Set NEXT_PUBLIC_AUTH_PROVIDER=okta for the hosted auth flow or NEXT_PUBLIC_AUTH_PROVIDER=mock only for explicit test and demo scenarios.',
    };
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
        process.env.NODE_ENV === 'production'
          ? 'Set NEXT_PUBLIC_AUTH_PROVIDER=okta and provide the required NEXT_PUBLIC_OKTA_* values before deploying.'
          : 'Okta auth config is missing. Run "npm run okta:render -- dev" before starting the web app.',
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

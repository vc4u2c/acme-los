export type WebAuthProviderMode = 'mock' | 'okta';

export interface OktaServerAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  fundingStepUpAcrValues: string;
  fundingStepUpMethod: string;
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

function getServerConfigValue(
  runtimeName: string,
  legacyPublicName: string,
): string | undefined {
  return (
    trimValue(process.env[runtimeName]) ??
    trimValue(process.env[legacyPublicName])
  );
}

export function getServerWebAuthConfig(): ServerWebAuthConfig {
  const requestedProvider = getServerConfigValue(
    'ACME_AUTH_PROVIDER',
    'NEXT_PUBLIC_AUTH_PROVIDER',
  );

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

  const issuer = getServerConfigValue(
    'ACME_OKTA_ISSUER',
    'NEXT_PUBLIC_OKTA_ISSUER',
  );
  const clientId = getServerConfigValue(
    'ACME_OKTA_CLIENT_ID',
    'NEXT_PUBLIC_OKTA_CLIENT_ID',
  );
  const redirectUri = getServerConfigValue(
    'ACME_OKTA_REDIRECT_URI',
    'NEXT_PUBLIC_OKTA_REDIRECT_URI',
  );
  const postLogoutRedirectUri = getServerConfigValue(
    'ACME_OKTA_POST_LOGOUT_REDIRECT_URI',
    'NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI',
  );

  if (!issuer || !clientId || !redirectUri || !postLogoutRedirectUri) {
    return {
      provider: 'okta',
      configurationError:
        process.env.NODE_ENV === 'production'
          ? 'Set ACME_AUTH_PROVIDER=okta and provide the required ACME_OKTA_* values before deploying.'
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
      scopes: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'okta.myAccount.email.read',
        'okta.myAccount.email.manage',
        'okta.myAccount.phone.read',
        'okta.myAccount.phone.manage',
      ],
      fundingStepUpAcrValues:
        getServerConfigValue(
          'ACME_OKTA_FUNDING_ACR_VALUES',
          'NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES',
        ) ?? 'urn:okta:loa:2fa:any',
      fundingStepUpMethod:
        getServerConfigValue(
          'ACME_OKTA_FUNDING_STEP_UP_METHOD',
          'NEXT_PUBLIC_OKTA_FUNDING_STEP_UP_METHOD',
        ) ?? 'email_or_sms',
    },
  };
}

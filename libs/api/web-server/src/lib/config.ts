export interface OktaServerAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  fundingStepUpAcrValues: string;
  fundingStepUpMethod: string;
  fundingStepUpRequiresPassword: boolean;
}

export interface ServerWebAuthConfig {
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

function getServerConfigValue(runtimeName: string): string | undefined {
  return trimValue(process.env[runtimeName]);
}

function getServerBooleanConfigValue(
  runtimeName: string,
  defaultValue: boolean,
): boolean {
  const value = getServerConfigValue(runtimeName);

  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true';
}

export function getServerWebAuthConfig(): ServerWebAuthConfig {
  const issuer = getServerConfigValue('ACME_OKTA_ISSUER');
  const clientId = getServerConfigValue('ACME_OKTA_CLIENT_ID');
  const redirectUri = getServerConfigValue('ACME_OKTA_REDIRECT_URI');
  const postLogoutRedirectUri = getServerConfigValue(
    'ACME_OKTA_POST_LOGOUT_REDIRECT_URI',
  );

  if (!issuer || !clientId || !redirectUri || !postLogoutRedirectUri) {
    return {
      configurationError:
        process.env.NODE_ENV === 'production'
          ? 'Provide the required ACME_OKTA_* values before deploying.'
          : 'Okta auth config is missing. Run "npm run okta:render -- dev" before starting the web app.',
    };
  }

  return {
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
        'okta.myAccount.password.read',
        'okta.myAccount.password.manage',
      ],
      fundingStepUpAcrValues:
        getServerConfigValue('ACME_OKTA_FUNDING_ACR_VALUES') ??
        'urn:okta:loa:2fa:any',
      fundingStepUpMethod:
        getServerConfigValue('ACME_OKTA_FUNDING_STEP_UP_METHOD') ??
        'email_or_sms',
      fundingStepUpRequiresPassword: getServerBooleanConfigValue(
        'ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD',
        false,
      ),
    },
  };
}

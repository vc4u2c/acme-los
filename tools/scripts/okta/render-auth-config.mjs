import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHostedErrorPageContent,
  buildHostedSignInPageContent,
  buildHostedSignInStartUrl,
} from './hosted-sign-in-page.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const environmentName = process.argv[2];

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/okta/render-auth-config.mjs <dev|qa|stg|prod>',
  );
  process.exit(1);
}

const environmentFile = path.join(
  repoRoot,
  'infra',
  'okta',
  'environments',
  `${environmentName}.json`,
);
const brandProfileFile = path.join(
  repoRoot,
  'infra',
  'okta',
  'brand',
  'acme-los.json',
);

if (!fs.existsSync(environmentFile)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentFile, 'utf8'));
const brandProfile = JSON.parse(fs.readFileSync(brandProfileFile, 'utf8'));

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${fieldName}" to be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSignInWidgetGeneration(value) {
  const normalized = optionalString(value)?.toUpperCase();
  if (!normalized) {
    return 'G3';
  }

  if (normalized !== 'G3') {
    throw new Error(
      'Expected okta.hostedExperience.signInWidgetGeneration to be "G3".',
    );
  }

  return normalized;
}

function resolveSignInWidgetVersion(value) {
  const version = optionalString(value);
  if (!version) {
    throw new Error(
      'Expected okta.hostedExperience.signInWidgetVersion to be an exact Okta-supported version like "7.46".',
    );
  }

  if (!/^\d+\.\d+$/.test(version)) {
    throw new Error(
      'Expected okta.hostedExperience.signInWidgetVersion to be pinned to an exact Okta hosted-widget version, not a floating range.',
    );
  }

  return version;
}

function resolveFundingStepUpMethod(value) {
  const method = optionalString(value)?.toLowerCase() ?? 'email_or_sms';

  if (!['email', 'sms', 'email_or_sms'].includes(method)) {
    throw new Error(
      'Expected okta.hostedExperience.fundingStepUpMethod to be "email", "sms", or "email_or_sms".',
    );
  }

  return method;
}

function optionalStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => optionalString(value))
    .filter((value) => typeof value === 'string');
}

function getUniqueValues(values) {
  return [...new Set(values.filter((value) => typeof value === 'string'))];
}

function resolveLocalWebBaseUrl(webConfig) {
  const baseUrl =
    optionalString(webConfig?.localBaseUrl) ??
    optionalString(webConfig?.baseUrl) ??
    optionalString(webConfig?.deployedBaseUrl);

  return requiredString(
    baseUrl,
    'web.localBaseUrl or web.baseUrl or web.deployedBaseUrl',
  );
}

function resolveDeployedWebBaseUrl(webConfig) {
  const baseUrl =
    optionalString(webConfig?.deployedBaseUrl) ??
    optionalString(webConfig?.baseUrl) ??
    optionalString(webConfig?.localBaseUrl);

  return requiredString(
    baseUrl,
    'web.deployedBaseUrl or web.baseUrl or web.localBaseUrl',
  );
}

function resolveAllowedWebBaseUrls(webConfig) {
  return getUniqueValues([
    resolveLocalWebBaseUrl(webConfig),
    resolveDeployedWebBaseUrl(webConfig),
    ...optionalStringArray(webConfig?.additionalBaseUrls),
  ]);
}

function resolveClientId(value, fallbackFieldName) {
  const manifestValue = optionalString(value);
  if (manifestValue) {
    return manifestValue;
  }

  return `replace-with-${environmentName}-${fallbackFieldName}`;
}

function toAbsoluteUrl(baseUrl, pathname) {
  return new URL(
    requiredString(pathname, 'path'),
    requiredString(baseUrl, 'baseUrl'),
  ).toString();
}

function toMobileRedirectUri(scheme, redirectPath) {
  const normalizedScheme = requiredString(scheme, 'mobile.scheme').replace(
    /:$/,
    '',
  );
  const normalizedPath = requiredString(
    redirectPath,
    'mobile.redirectPath',
  ).replace(/^\/+/, '');
  return `${normalizedScheme}://${normalizedPath}`;
}

function writeFile(relativePath, contents) {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents, 'utf8');
  return targetPath;
}

const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaOrgUrl =
  optionalString(environment.okta?.orgUrl) ??
  new URL('/', issuer).toString().replace(/\/$/, '');
const webClientId = resolveClientId(
  environment.okta?.webClientId,
  'web-client-id',
);
const mobileClientId = resolveClientId(
  environment.okta?.mobileClientId,
  'mobile-client-id',
);
const fundingStepUpAcrValues = requiredString(
  environment.okta?.fundingStepUpAcrValues,
  'okta.fundingStepUpAcrValues',
);
const localWebBaseUrl = resolveLocalWebBaseUrl(environment.web);
const deployedWebBaseUrl = resolveDeployedWebBaseUrl(environment.web);
const allowedWebBaseUrls = resolveAllowedWebBaseUrls(environment.web);
const webRedirectPath = requiredString(
  environment.web?.redirectPath,
  'web.redirectPath',
);
const webPostLogoutRedirectPath = requiredString(
  environment.web?.postLogoutRedirectPath,
  'web.postLogoutRedirectPath',
);
const mobileScheme = requiredString(
  environment.mobile?.scheme,
  'mobile.scheme',
);
const mobileRedirectPath = requiredString(
  environment.mobile?.redirectPath,
  'mobile.redirectPath',
);

const webRedirectUri = toAbsoluteUrl(localWebBaseUrl, webRedirectPath);
const webPostLogoutRedirectUri = toAbsoluteUrl(
  localWebBaseUrl,
  webPostLogoutRedirectPath,
);
const mobileRedirectUri = toMobileRedirectUri(mobileScheme, mobileRedirectPath);
const signInStartUrl = buildHostedSignInStartUrl(deployedWebBaseUrl);

const hostedExperience = environment.okta?.hostedExperience ?? {};
const signInWidgetGeneration = resolveSignInWidgetGeneration(
  hostedExperience.signInWidgetGeneration,
);
const signInWidgetVersion = resolveSignInWidgetVersion(
  hostedExperience.signInWidgetVersion,
);
const fundingStepUpMethod = resolveFundingStepUpMethod(
  hostedExperience.fundingStepUpMethod,
);
const fundingStepUpRequiresPassword =
  hostedExperience.fundingStepUpRequiresPassword === true;
const themeCookieDomain =
  optionalString(hostedExperience.themeCookieDomain) ?? '';
const policySummary = [
  `sign-in-widget-generation=${signInWidgetGeneration}`,
  `sign-in-widget-version=${signInWidgetVersion}`,
  `remember-user=${Boolean(hostedExperience.rememberUser)}`,
  `keep-me-signed-in=${Boolean(hostedExperience.keepMeSignedIn)}`,
  `registration-email-verification=${Boolean(hostedExperience.registrationRequiresEmailVerification)}`,
  `registration-phone-verification=${Boolean(hostedExperience.registrationRequiresPhoneVerification)}`,
  `adaptive-mfa-sign-in=${Boolean(hostedExperience.adaptiveMfaOnSignIn)}`,
  `funding-step-up=${Boolean(hostedExperience.fundingRouteStepUp)}`,
  `funding-step-up-method=${fundingStepUpMethod}`,
  `funding-step-up-password=${fundingStepUpRequiresPassword}`,
  `recovery-contact-hints=${Boolean(hostedExperience.recoveryContactHints)}`,
  `theme-toggle=${Boolean(hostedExperience.themeToggle)}`,
  `theme-cookie-domain=${themeCookieDomain || 'host-only'}`,
].join(', ');

const hostedBranding = {
  DefaultBrandName: requiredString(
    brandProfile.defaultBrandName,
    'brand.defaultBrandName',
  ),
  BrandName: requiredString(
    brandProfile.customerBrandName,
    'brand.customerBrandName',
  ),
  ProductName: requiredString(brandProfile.productName, 'brand.productName'),
  SupportPhone: requiredString(brandProfile.supportPhone, 'brand.supportPhone'),
  SupportHours: requiredString(brandProfile.supportHours, 'brand.supportHours'),
  LogoUrl: toAbsoluteUrl(
    deployedWebBaseUrl,
    requiredString(brandProfile.logoPath, 'brand.logoPath'),
  ),
  FaviconUrl: toAbsoluteUrl(
    deployedWebBaseUrl,
    requiredString(brandProfile.iconPath, 'brand.iconPath'),
  ),
  PrimaryColor: requiredString(brandProfile.primaryColor, 'brand.primaryColor'),
  PrimaryContrastColor: requiredString(
    brandProfile.primaryContrastColor,
    'brand.primaryContrastColor',
  ),
  SecondaryColor: requiredString(
    brandProfile.secondaryColor,
    'brand.secondaryColor',
  ),
  BackgroundColor: requiredString(
    brandProfile.backgroundColor,
    'brand.backgroundColor',
  ),
  SurfaceColor: requiredString(brandProfile.surfaceColor, 'brand.surfaceColor'),
  TextColor: requiredString(brandProfile.textColor, 'brand.textColor'),
  MutedTextColor: requiredString(
    brandProfile.mutedTextColor,
    'brand.mutedTextColor',
  ),
  LinkColor: requiredString(brandProfile.linkColor, 'brand.linkColor'),
  BorderColor: requiredString(brandProfile.borderColor, 'brand.borderColor'),
  FocusColor: requiredString(brandProfile.focusColor, 'brand.focusColor'),
  AccentColor: requiredString(brandProfile.accentColor, 'brand.accentColor'),
  PrivacyPolicyUrl: toAbsoluteUrl(
    deployedWebBaseUrl,
    requiredString(brandProfile.privacyPolicyPath, 'brand.privacyPolicyPath'),
  ),
  TermsUrl: toAbsoluteUrl(
    deployedWebBaseUrl,
    requiredString(brandProfile.termsPath, 'brand.termsPath'),
  ),
  HelpUrl: toAbsoluteUrl(
    deployedWebBaseUrl,
    requiredString(brandProfile.helpPath, 'brand.helpPath'),
  ),
  SignInStartUrl: signInStartUrl,
  SignInTitle: requiredString(brandProfile.signInTitle, 'brand.signInTitle'),
  SignInSubtitle: requiredString(
    brandProfile.signInSubtitle,
    'brand.signInSubtitle',
  ),
  SignUpTitle: requiredString(brandProfile.signUpTitle, 'brand.signUpTitle'),
  SignUpSubtitle: requiredString(
    brandProfile.signUpSubtitle,
    'brand.signUpSubtitle',
  ),
  ThemeCookieDomain: themeCookieDomain,
};

const webEnvContents = [
  `# Generated from infra/okta/environments/${environmentName}.json`,
  `# Policy intent: ${policySummary}`,
  'NEXT_PUBLIC_APP_ENVIRONMENT=local',
  'NEXT_PUBLIC_AUTH_PROVIDER=okta',
  `NEXT_PUBLIC_OKTA_ENVIRONMENT=${environment.environment}`,
  `NEXT_PUBLIC_OKTA_ISSUER=${issuer}`,
  `NEXT_PUBLIC_OKTA_ORG_URL=${oktaOrgUrl}`,
  `NEXT_PUBLIC_OKTA_CLIENT_ID=${webClientId}`,
  `NEXT_PUBLIC_OKTA_REDIRECT_URI=${webRedirectUri}`,
  `NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI=${webPostLogoutRedirectUri}`,
  `NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES=${fundingStepUpAcrValues}`,
  `ACME_OKTA_FUNDING_STEP_UP_METHOD=${fundingStepUpMethod}`,
  `NEXT_PUBLIC_OKTA_FUNDING_STEP_UP_METHOD=${fundingStepUpMethod}`,
  `NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN=${themeCookieDomain}`,
  '',
].join('\n');

const mobileEnvContents = [
  `# Generated from infra/okta/environments/${environmentName}.json`,
  `# Policy intent: ${policySummary}`,
  'EXPO_PUBLIC_APP_ENVIRONMENT=local',
  'EXPO_PUBLIC_AUTH_PROVIDER=okta',
  `EXPO_PUBLIC_OKTA_ENVIRONMENT=${environment.environment}`,
  `EXPO_PUBLIC_OKTA_ISSUER=${issuer}`,
  `EXPO_PUBLIC_OKTA_CLIENT_ID=${mobileClientId}`,
  `EXPO_PUBLIC_OKTA_REDIRECT_URI=${mobileRedirectUri}`,
  `EXPO_PUBLIC_OKTA_FUNDING_ACR_VALUES=${fundingStepUpAcrValues}`,
  `EXPO_PUBLIC_OKTA_FUNDING_STEP_UP_METHOD=${fundingStepUpMethod}`,
  '',
].join('\n');

const bffSettings = {
  Authentication: {
    Provider: 'Okta',
    Okta: {
      Environment: environment.environment,
      Issuer: issuer,
      FundingStepUpAcrValues: fundingStepUpAcrValues,
      LoginPath: requiredString(environment.bff?.loginPath, 'bff.loginPath'),
      CallbackPath: requiredString(
        environment.bff?.callbackPath,
        'bff.callbackPath',
      ),
      LogoutPath: requiredString(environment.bff?.logoutPath, 'bff.logoutPath'),
      SessionPath: requiredString(
        environment.bff?.sessionPath,
        'bff.sessionPath',
      ),
      BaseUrl: requiredString(environment.bff?.baseUrl, 'bff.baseUrl'),
      HostedExperience: {
        SignInWidgetGeneration: signInWidgetGeneration,
        SignInWidgetVersion: signInWidgetVersion,
        RememberUser: Boolean(hostedExperience.rememberUser),
        KeepMeSignedIn: Boolean(hostedExperience.keepMeSignedIn),
        RegistrationRequiresEmailVerification: Boolean(
          hostedExperience.registrationRequiresEmailVerification,
        ),
        RegistrationRequiresPhoneVerification: Boolean(
          hostedExperience.registrationRequiresPhoneVerification,
        ),
        AdaptiveMfaOnSignIn: Boolean(hostedExperience.adaptiveMfaOnSignIn),
        FundingRouteStepUp: Boolean(hostedExperience.fundingRouteStepUp),
        FundingStepUpMethod: fundingStepUpMethod,
        FundingStepUpRequiresPassword: fundingStepUpRequiresPassword,
        RecoveryContactHints: Boolean(hostedExperience.recoveryContactHints),
        ThemeToggle: Boolean(hostedExperience.themeToggle),
        ThemeCookieDomain: themeCookieDomain,
      },
      Branding: hostedBranding,
    },
  },
};

const oktaApplications = {
  Environment: environment.environment,
  Web: {
    ApplicationType: 'browser-spa-pkce',
    Issuer: issuer,
    ClientId: webClientId,
    BaseUrl: deployedWebBaseUrl,
    RedirectUris: allowedWebBaseUrls.map((baseUrl) =>
      toAbsoluteUrl(baseUrl, webRedirectPath),
    ),
    PostLogoutRedirectUris: allowedWebBaseUrls.map((baseUrl) =>
      toAbsoluteUrl(baseUrl, webPostLogoutRedirectPath),
    ),
    RegistrationHandledByOkta: true,
  },
  Mobile: {
    ApplicationType: 'native-pkce',
    Issuer: issuer,
    ClientId: mobileClientId,
    RedirectUris: [mobileRedirectUri],
    RegistrationHandledByOkta: true,
  },
  StepUp: {
    FundingAcrValues: fundingStepUpAcrValues,
    Method: fundingStepUpMethod,
    RequiresPassword: fundingStepUpRequiresPassword,
  },
};

const oktaHostedExperience = {
  Environment: environment.environment,
  PolicyIntent: hostedExperience,
  Branding: hostedBranding,
};

const oktaHostedPages = {
  Environment: environment.environment,
  SignIn: {
    PageContent: buildHostedSignInPageContent(hostedBranding),
  },
  Error: {
    PageContent: buildHostedErrorPageContent(hostedBranding),
  },
};

const webEnvPath = writeFile('apps/web-app/.env.local', webEnvContents);
const mobileEnvPath = writeFile(
  'apps/mobile-app/.env.local',
  mobileEnvContents,
);
const bffSettingsPath = writeFile(
  `tmp/okta/${environmentName}.bff.authsettings.json`,
  `${JSON.stringify(bffSettings, null, 2)}\n`,
);
const hostedBrandingPath = writeFile(
  `tmp/okta/${environmentName}.okta-hosted-branding.json`,
  `${JSON.stringify(oktaHostedExperience, null, 2)}\n`,
);
const hostedPagesPath = writeFile(
  `tmp/okta/${environmentName}.okta-hosted-pages.json`,
  `${JSON.stringify(oktaHostedPages, null, 2)}\n`,
);
const oktaApplicationsPath = writeFile(
  `tmp/okta/${environmentName}.okta-applications.json`,
  `${JSON.stringify(oktaApplications, null, 2)}\n`,
);

console.log(`Rendered Okta config for "${environmentName}".`);
console.log(`- Web env: ${path.relative(repoRoot, webEnvPath)}`);
console.log(`- Mobile env: ${path.relative(repoRoot, mobileEnvPath)}`);
console.log(`- BFF settings: ${path.relative(repoRoot, bffSettingsPath)}`);
console.log(
  `- Hosted branding: ${path.relative(repoRoot, hostedBrandingPath)}`,
);
console.log(`- Hosted pages: ${path.relative(repoRoot, hostedPagesPath)}`);
console.log(`- Okta apps: ${path.relative(repoRoot, oktaApplicationsPath)}`);

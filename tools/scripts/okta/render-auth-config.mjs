import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHostedErrorPageContent,
  buildHostedSignInPageContent,
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
const terraformOutputsFile = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.terraform.outputs.json`,
);
const terraformOutputs = fs.existsSync(terraformOutputsFile)
  ? JSON.parse(fs.readFileSync(terraformOutputsFile, 'utf8'))
  : {};

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

function resolveClientId(value, terraformValue, fallbackFieldName) {
  const renderedValue = optionalString(terraformValue);

  if (renderedValue) {
    return renderedValue;
  }

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

function deriveOktaProviderShape(issuerValue) {
  const issuerUrl = new URL(requiredString(issuerValue, 'okta.issuer'));
  const hostParts = issuerUrl.hostname.split('.');

  if (hostParts.length < 3) {
    throw new Error(
      `Expected Okta issuer host "${issuerUrl.hostname}" to contain an org subdomain and base domain.`,
    );
  }

  return {
    orgName: hostParts[0],
    baseUrl: hostParts.slice(1).join('.'),
  };
}

const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const { orgName: oktaOrgName, baseUrl: oktaBaseUrl } =
  deriveOktaProviderShape(issuer);
const webClientId = resolveClientId(
  environment.okta?.webClientId,
  terraformOutputs.webClientId,
  'web-client-id',
);
const mobileClientId = resolveClientId(
  environment.okta?.mobileClientId,
  terraformOutputs.mobileClientId,
  'mobile-client-id',
);
const fundingStepUpAcrValues = requiredString(
  environment.okta?.fundingStepUpAcrValues,
  'okta.fundingStepUpAcrValues',
);
const webBaseUrl = requiredString(environment.web?.baseUrl, 'web.baseUrl');
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

const webRedirectUri = toAbsoluteUrl(webBaseUrl, webRedirectPath);
const webPostLogoutRedirectUri = toAbsoluteUrl(
  webBaseUrl,
  webPostLogoutRedirectPath,
);
const mobileRedirectUri = toMobileRedirectUri(mobileScheme, mobileRedirectPath);

const hostedExperience = environment.okta?.hostedExperience ?? {};
const policySummary = [
  `remember-user=${Boolean(hostedExperience.rememberUser)}`,
  `keep-me-signed-in=${Boolean(hostedExperience.keepMeSignedIn)}`,
  `registration-email-verification=${Boolean(hostedExperience.registrationRequiresEmailVerification)}`,
  `registration-phone-verification=${Boolean(hostedExperience.registrationRequiresPhoneVerification)}`,
  `adaptive-mfa-sign-in=${Boolean(hostedExperience.adaptiveMfaOnSignIn)}`,
  `funding-step-up=${Boolean(hostedExperience.fundingRouteStepUp)}`,
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
    webBaseUrl,
    requiredString(brandProfile.logoPath, 'brand.logoPath'),
  ),
  FaviconUrl: toAbsoluteUrl(
    webBaseUrl,
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
    webBaseUrl,
    requiredString(brandProfile.privacyPolicyPath, 'brand.privacyPolicyPath'),
  ),
  TermsUrl: toAbsoluteUrl(
    webBaseUrl,
    requiredString(brandProfile.termsPath, 'brand.termsPath'),
  ),
  HelpUrl: toAbsoluteUrl(
    webBaseUrl,
    requiredString(brandProfile.helpPath, 'brand.helpPath'),
  ),
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
};

const webEnvContents = [
  `# Generated from infra/okta/environments/${environmentName}.json`,
  `# Policy intent: ${policySummary}`,
  'NEXT_PUBLIC_AUTH_PROVIDER=okta',
  `NEXT_PUBLIC_OKTA_ENVIRONMENT=${environment.environment}`,
  `NEXT_PUBLIC_OKTA_ISSUER=${issuer}`,
  `NEXT_PUBLIC_OKTA_CLIENT_ID=${webClientId}`,
  `NEXT_PUBLIC_OKTA_REDIRECT_URI=${webRedirectUri}`,
  `NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI=${webPostLogoutRedirectUri}`,
  `NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES=${fundingStepUpAcrValues}`,
  '',
].join('\n');

const mobileEnvContents = [
  `# Generated from infra/okta/environments/${environmentName}.json`,
  `# Policy intent: ${policySummary}`,
  'EXPO_PUBLIC_AUTH_PROVIDER=okta',
  `EXPO_PUBLIC_OKTA_ENVIRONMENT=${environment.environment}`,
  `EXPO_PUBLIC_OKTA_ISSUER=${issuer}`,
  `EXPO_PUBLIC_OKTA_CLIENT_ID=${mobileClientId}`,
  `EXPO_PUBLIC_OKTA_REDIRECT_URI=${mobileRedirectUri}`,
  `EXPO_PUBLIC_OKTA_FUNDING_ACR_VALUES=${fundingStepUpAcrValues}`,
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
    BaseUrl: webBaseUrl,
    RedirectUris: [webRedirectUri],
    PostLogoutRedirectUris: [webPostLogoutRedirectUri],
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

const terraformVariables = {
  environment_name: environment.environment,
  okta_org_name: oktaOrgName,
  okta_base_url: oktaBaseUrl,
  issuer,
  web_base_url: webBaseUrl,
  web_redirect_uri: webRedirectUri,
  web_post_logout_redirect_uri: webPostLogoutRedirectUri,
  mobile_redirect_uri: mobileRedirectUri,
  funding_step_up_acr_values: fundingStepUpAcrValues,
  web_app_name: `ACME LOS Web (${environment.environment})`,
  mobile_app_name: `ACME LOS Mobile (${environment.environment})`,
  customer_group_name: `acme-los-customers-${environment.environment}`,
  trusted_origin_name: `ACME LOS Web ${environment.environment.toUpperCase()}`,
  manage_hosted_branding: false,
  hosted_experience: {
    remember_user: Boolean(hostedExperience.rememberUser),
    keep_me_signed_in: Boolean(hostedExperience.keepMeSignedIn),
    registration_requires_email_verification: Boolean(
      hostedExperience.registrationRequiresEmailVerification,
    ),
    registration_requires_phone_verification: Boolean(
      hostedExperience.registrationRequiresPhoneVerification,
    ),
    adaptive_mfa_on_sign_in: Boolean(hostedExperience.adaptiveMfaOnSignIn),
    funding_route_step_up: Boolean(hostedExperience.fundingRouteStepUp),
  },
  branding: {
    default_brand_name: hostedBranding.DefaultBrandName,
    brand_name: hostedBranding.BrandName,
    product_name: hostedBranding.ProductName,
    support_phone: hostedBranding.SupportPhone,
    support_hours: hostedBranding.SupportHours,
    logo_url: hostedBranding.LogoUrl,
    favicon_url: hostedBranding.FaviconUrl,
    primary_color: hostedBranding.PrimaryColor,
    primary_contrast_color: hostedBranding.PrimaryContrastColor,
    secondary_color: hostedBranding.SecondaryColor,
    background_color: hostedBranding.BackgroundColor,
    surface_color: hostedBranding.SurfaceColor,
    text_color: hostedBranding.TextColor,
    muted_text_color: hostedBranding.MutedTextColor,
    link_color: hostedBranding.LinkColor,
    border_color: hostedBranding.BorderColor,
    focus_color: hostedBranding.FocusColor,
    accent_color: hostedBranding.AccentColor,
    privacy_policy_url: hostedBranding.PrivacyPolicyUrl,
    terms_url: hostedBranding.TermsUrl,
    help_url: hostedBranding.HelpUrl,
    sign_in_title: hostedBranding.SignInTitle,
    sign_in_subtitle: hostedBranding.SignInSubtitle,
    sign_up_title: hostedBranding.SignUpTitle,
    sign_up_subtitle: hostedBranding.SignUpSubtitle,
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
const terraformVariablesPath = writeFile(
  `tmp/okta/${environmentName}.terraform.auto.tfvars.json`,
  `${JSON.stringify(terraformVariables, null, 2)}\n`,
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
console.log(
  `- Terraform vars: ${path.relative(repoRoot, terraformVariablesPath)}`,
);

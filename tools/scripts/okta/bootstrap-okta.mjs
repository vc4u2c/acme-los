import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildHostedErrorPageContent,
  buildHostedSignInPageContent,
} from './hosted-sign-in-page.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/okta/bootstrap-okta.mjs <dev|qa|stg|prod> [--dry-run]',
  );
  process.exit(1);
}

const environmentPath = path.join(
  repoRoot,
  'infra',
  'okta',
  'environments',
  `${environmentName}.json`,
);
const brandProfilePath = path.join(
  repoRoot,
  'infra',
  'okta',
  'brand',
  'acme-los.json',
);
const bootstrapOutputsPath = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.bootstrap.outputs.json`,
);

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

if (!dryRun && !process.env.OKTA_API_TOKEN?.trim()) {
  console.error('Set OKTA_API_TOKEN before running the Okta bootstrap script.');
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const brandProfile = JSON.parse(fs.readFileSync(brandProfilePath, 'utf8'));
const token = process.env.OKTA_API_TOKEN?.trim();
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const warnings = [];

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

function resolveAuthorizationServerId(issuerValue) {
  const issuerUrl = new URL(requiredString(issuerValue, 'okta.issuer'));
  const pathSegments = issuerUrl.pathname.split('/').filter(Boolean);
  const oauthIndex = pathSegments.indexOf('oauth2');

  if (oauthIndex === -1 || oauthIndex === pathSegments.length - 1) {
    throw new Error(
      `Expected "${issuerValue}" to include an Okta authorization server path like /oauth2/default.`,
    );
  }

  return pathSegments[oauthIndex + 1];
}

function arraysEqualAsSets(left, right) {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== right.length
  ) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function writeJsonFile(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderEnvironment() {
  const renderResult = spawnSync(
    process.execPath,
    [path.join(scriptDirectory, 'render-auth-config.mjs'), environmentName],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (renderResult.status !== 0) {
    process.exit(renderResult.status ?? 1);
  }
}

function resolveRepoFile(relativePath, fieldName) {
  const targetPath = path.join(
    repoRoot,
    requiredString(relativePath, fieldName),
  );
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected "${fieldName}" to exist at ${relativePath}.`);
  }

  return targetPath;
}

function contentTypeForAsset(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    default:
      throw new Error(`Unsupported hosted branding asset type "${extension}".`);
  }
}

async function oktaRequest(method, pathname, body, query = undefined) {
  const url = new URL(pathname, oktaApiBaseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `SSWS ${token}`,
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!response.ok) {
    let details = '';
    try {
      details = JSON.stringify(await response.json());
    } catch {
      details = await response.text();
    }

    throw new Error(
      `${method} ${url} failed with ${response.status}: ${details}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function oktaRequestNullable(
  method,
  pathname,
  body = undefined,
  query = undefined,
) {
  try {
    return await oktaRequest(method, pathname, body, query);
  } catch (error) {
    if (error instanceof Error && error.message.includes(' 404:')) {
      return null;
    }

    throw error;
  }
}

async function findApplicationByLabel(label) {
  const apps = await oktaRequest('GET', '/api/v1/apps', undefined, {
    q: label,
    limit: '200',
  });
  return (
    apps.find(
      (app) => app.label === label && app.signOnMode === 'OPENID_CONNECT',
    ) ?? null
  );
}

function extractClientId(app) {
  return (
    app?.credentials?.oauthClient?.client_id ??
    app?.credentials?.oauthClient?.clientId ??
    app?.credentials?.oauth_client?.client_id ??
    ''
  );
}

function ensureAppMatches(app, expected, expectedLabel) {
  const oauthClient = app?.settings?.oauthClient ?? {};
  const mismatches = [];

  if (app?.label !== expectedLabel) {
    mismatches.push(`label=${app?.label ?? 'missing'}`);
  }

  if (oauthClient.application_type !== expected.applicationType) {
    mismatches.push(
      `application_type=${oauthClient.application_type ?? 'missing'}`,
    );
  }

  if (
    !arraysEqualAsSets(oauthClient.redirect_uris ?? [], expected.redirectUris)
  ) {
    mismatches.push(
      `redirect_uris=${JSON.stringify(oauthClient.redirect_uris ?? [])}`,
    );
  }

  if (
    !arraysEqualAsSets(
      oauthClient.post_logout_redirect_uris ?? [],
      expected.postLogoutRedirectUris,
    )
  ) {
    mismatches.push(
      `post_logout_redirect_uris=${JSON.stringify(oauthClient.post_logout_redirect_uris ?? [])}`,
    );
  }

  if (!arraysEqualAsSets(oauthClient.grant_types ?? [], expected.grantTypes)) {
    mismatches.push(
      `grant_types=${JSON.stringify(oauthClient.grant_types ?? [])}`,
    );
  }

  if (
    !arraysEqualAsSets(oauthClient.response_types ?? [], expected.responseTypes)
  ) {
    mismatches.push(
      `response_types=${JSON.stringify(oauthClient.response_types ?? [])}`,
    );
  }

  if (app?.credentials?.oauthClient?.token_endpoint_auth_method !== 'none') {
    mismatches.push(
      `token_endpoint_auth_method=${app?.credentials?.oauthClient?.token_endpoint_auth_method ?? 'missing'}`,
    );
  }

  return mismatches;
}

async function createApplication(payload) {
  return oktaRequest('POST', '/api/v1/apps', payload);
}

async function updateApplication(appId, payload) {
  return oktaRequest('PUT', `/api/v1/apps/${appId}`, payload);
}

async function findTrustedOriginByOrigin(origin) {
  const trustedOrigins = await oktaRequest(
    'GET',
    '/api/v1/trustedOrigins',
    undefined,
    {
      filter: `origin eq "${origin}"`,
      limit: '200',
    },
  );

  return (
    trustedOrigins.find((trustedOrigin) => trustedOrigin.origin === origin) ??
    null
  );
}

async function createTrustedOrigin(payload) {
  return oktaRequest('POST', '/api/v1/trustedOrigins', payload);
}

async function deleteTrustedOrigin(trustedOrigin) {
  if (!trustedOrigin) {
    return;
  }

  await oktaRequest('DELETE', `/api/v1/trustedOrigins/${trustedOrigin.id}`);
}

async function listBrands() {
  return oktaRequest('GET', '/api/v1/brands');
}

async function createBrand(payload) {
  return oktaRequest('POST', '/api/v1/brands', payload);
}

async function updateBrand(brandId, payload) {
  return oktaRequest('PUT', `/api/v1/brands/${brandId}`, payload);
}

async function listThemes(brandId) {
  return oktaRequest('GET', `/api/v1/brands/${brandId}/themes`);
}

async function updateTheme(brandId, themeId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/brands/${brandId}/themes/${themeId}`,
    payload,
  );
}

async function uploadThemeAsset(brandId, themeId, assetType, repoRelativePath) {
  const absolutePath = resolveRepoFile(
    repoRelativePath,
    `brand.${assetType}AssetPath`,
  );
  const buffer = fs.readFileSync(absolutePath);
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([buffer], { type: contentTypeForAsset(absolutePath) }),
    path.basename(absolutePath),
  );

  return oktaRequest(
    'POST',
    `/api/v1/brands/${brandId}/themes/${themeId}/${assetType}`,
    formData,
  );
}

async function deleteThemeAsset(brandId, themeId, assetType) {
  return oktaRequestNullable(
    'DELETE',
    `/api/v1/brands/${brandId}/themes/${themeId}/${assetType}`,
  );
}

async function listBrandDomains(brandId) {
  const response = await oktaRequest(
    'GET',
    `/api/v1/brands/${brandId}/domains`,
  );
  return response?.domains ?? [];
}

async function getDefaultSignInPage(brandId) {
  return oktaRequest('GET', `/api/v1/brands/${brandId}/pages/sign-in/default`);
}

async function putCustomizedSignInPage(brandId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/brands/${brandId}/pages/sign-in/customized`,
    payload,
  );
}

async function getDefaultErrorPage(brandId) {
  return oktaRequest('GET', `/api/v1/brands/${brandId}/pages/error/default`);
}

async function putCustomizedErrorPage(brandId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/brands/${brandId}/pages/error/customized`,
    payload,
  );
}

async function listAuthenticators() {
  return oktaRequest('GET', '/api/v1/authenticators');
}

async function activateAuthenticator(authenticatorId) {
  return oktaRequest(
    'POST',
    `/api/v1/authenticators/${authenticatorId}/lifecycle/activate`,
  );
}

async function updateAuthenticator(authenticatorId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/authenticators/${authenticatorId}`,
    payload,
  );
}

async function findGroupByName(name) {
  const groups = await oktaRequest('GET', '/api/v1/groups', undefined, {
    search: `profile.name eq "${name.replaceAll('"', '\\"')}"`,
    limit: '200',
  });
  return groups.find((group) => group?.profile?.name === name) ?? null;
}

async function createGroup(name, description) {
  return oktaRequest('POST', '/api/v1/groups', {
    profile: {
      name,
      description,
    },
  });
}

async function listPolicies(type) {
  return oktaRequest('GET', '/api/v1/policies', undefined, {
    type,
    limit: '200',
  });
}

async function findPolicyByTypeAndName(type, name) {
  const policies = await listPolicies(type);
  return policies.find((policy) => policy.name === name) ?? null;
}

async function createPolicy(payload) {
  return oktaRequest('POST', '/api/v1/policies', payload, {
    activate: 'true',
  });
}

async function updatePolicy(policyId, payload) {
  return oktaRequest('PUT', `/api/v1/policies/${policyId}`, payload);
}

async function listPolicyRules(policyId) {
  return oktaRequest('GET', `/api/v1/policies/${policyId}/rules`);
}

async function createPolicyRule(policyId, payload) {
  return oktaRequest('POST', `/api/v1/policies/${policyId}/rules`, payload);
}

async function updatePolicyRule(policyId, ruleId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/policies/${policyId}/rules/${ruleId}`,
    payload,
  );
}

async function assignPolicyToApp(appId, policyId) {
  return oktaRequest('PUT', `/api/v1/apps/${appId}/policies/${policyId}`);
}

async function assignGroupToApplication(appId, groupId) {
  return oktaRequest('PUT', `/api/v1/apps/${appId}/groups/${groupId}`, {});
}

async function getDefaultUserSchema() {
  return oktaRequest('GET', '/api/v1/meta/schemas/user/default');
}

async function updateDefaultUserSchema(payload) {
  return oktaRequest('POST', '/api/v1/meta/schemas/user/default', payload);
}

async function listAuthorizationServerPolicies(authServerId) {
  return oktaRequest(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/policies`,
  );
}

async function findAuthorizationServerPolicyByName(authServerId, name) {
  const policies = await listAuthorizationServerPolicies(authServerId);
  return policies.find((policy) => policy.name === name) ?? null;
}

async function createAuthorizationServerPolicy(authServerId, payload) {
  return oktaRequest(
    'POST',
    `/api/v1/authorizationServers/${authServerId}/policies`,
    payload,
  );
}

async function updateAuthorizationServerPolicy(
  authServerId,
  policyId,
  payload,
) {
  return oktaRequest(
    'PUT',
    `/api/v1/authorizationServers/${authServerId}/policies/${policyId}`,
    payload,
  );
}

async function listAuthorizationServerRules(authServerId, policyId) {
  return oktaRequest(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/policies/${policyId}/rules`,
  );
}

async function createAuthorizationServerRule(authServerId, policyId, payload) {
  return oktaRequest(
    'POST',
    `/api/v1/authorizationServers/${authServerId}/policies/${policyId}/rules`,
    payload,
  );
}

async function updateAuthorizationServerRule(
  authServerId,
  policyId,
  ruleId,
  payload,
) {
  return oktaRequest(
    'PUT',
    `/api/v1/authorizationServers/${authServerId}/policies/${policyId}/rules/${ruleId}`,
    payload,
  );
}

async function listAuthorizationServerClaims(authServerId) {
  return oktaRequest(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/claims`,
  );
}

async function createAuthorizationServerClaim(authServerId, payload) {
  return oktaRequest(
    'POST',
    `/api/v1/authorizationServers/${authServerId}/claims`,
    payload,
  );
}

async function updateAuthorizationServerClaim(authServerId, claimId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/authorizationServers/${authServerId}/claims/${claimId}`,
    payload,
  );
}

function getCatchAllRule(rules) {
  return (
    rules.find((rule) => rule.name === 'Catch-all Rule') ??
    rules.find((rule) => rule.name === 'Default Rule') ??
    rules[0] ??
    null
  );
}

async function ensurePolicy(type, name, payloadBuilder) {
  const existingPolicy = await findPolicyByTypeAndName(type, name);
  const payload = payloadBuilder(existingPolicy);
  if (existingPolicy) {
    return {
      mode: 'updated',
      policy: await updatePolicy(existingPolicy.id, payload),
    };
  }

  return {
    mode: 'created',
    policy: await createPolicy(payload),
  };
}

async function ensureRule(
  policyId,
  ruleName,
  payloadBuilder,
  fallbackMatcher = undefined,
) {
  const rules = await listPolicyRules(policyId);
  const existingRule =
    rules.find((rule) => rule.name === ruleName) ??
    (typeof fallbackMatcher === 'function'
      ? rules.find((rule) => fallbackMatcher(rule))
      : null);
  const payload = payloadBuilder(existingRule);

  if (existingRule) {
    return {
      mode: 'updated',
      rule: await updatePolicyRule(policyId, existingRule.id, payload),
    };
  }

  return {
    mode: 'created',
    rule: await createPolicyRule(policyId, payload),
  };
}

async function ensureAuthorizationServerPolicy(
  authServerId,
  policyName,
  payloadBuilder,
) {
  const existingPolicy = await findAuthorizationServerPolicyByName(
    authServerId,
    policyName,
  );
  const payload = payloadBuilder(existingPolicy);

  if (existingPolicy) {
    return {
      mode: 'updated',
      policy: await updateAuthorizationServerPolicy(
        authServerId,
        existingPolicy.id,
        payload,
      ),
    };
  }

  return {
    mode: 'created',
    policy: await createAuthorizationServerPolicy(authServerId, payload),
  };
}

async function ensureAuthorizationServerRule(
  authServerId,
  policyId,
  ruleName,
  payloadBuilder,
) {
  const rules = await listAuthorizationServerRules(authServerId, policyId);
  const existingRule = rules.find((rule) => rule.name === ruleName) ?? null;
  const payload = payloadBuilder(existingRule);

  if (existingRule) {
    return {
      mode: 'updated',
      rule: await updateAuthorizationServerRule(
        authServerId,
        policyId,
        existingRule.id,
        payload,
      ),
    };
  }

  return {
    mode: 'created',
    rule: await createAuthorizationServerRule(authServerId, policyId, payload),
  };
}

async function ensureUserProfileAttributes(attributeDefinitions) {
  const currentSchema = await getDefaultUserSchema();
  const currentProperties =
    currentSchema?.definitions?.custom?.properties ?? {};
  const nextProperties = { ...currentProperties };
  const changedAttributes = [];

  for (const [key, definition] of Object.entries(attributeDefinitions)) {
    const existingDefinition = currentProperties[key];
    const expectedDefinition = {
      title: definition.title,
      description: definition.description,
      type: 'string',
      required: false,
      minLength: 1,
      maxLength: 255,
      permissions: [
        {
          principal: 'SELF',
          action: 'READ_ONLY',
        },
      ],
      master: {
        type: 'PROFILE_MASTER',
      },
      scope: 'NONE',
      mutability: 'READ_WRITE',
    };

    nextProperties[key] = expectedDefinition;

    if (!profileAttributeMatches(existingDefinition, expectedDefinition)) {
      changedAttributes.push(key);
    }
  }

  if (changedAttributes.length === 0) {
    return {
      mode: 'existing',
      schema: currentSchema,
      changedAttributes: [],
    };
  }

  const updatedSchema = await updateDefaultUserSchema({
    definitions: {
      custom: {
        id: '#custom',
        type: 'object',
        properties: nextProperties,
      },
    },
  });

  return {
    mode: 'updated',
    schema: updatedSchema,
    changedAttributes,
  };
}

async function ensureAuthorizationServerClaim(
  authServerId,
  claimName,
  claimType,
  payloadBuilder,
) {
  const claims = await listAuthorizationServerClaims(authServerId);
  const existingClaim =
    claims.find(
      (claim) =>
        claim.name === claimName &&
        claim.claimType === claimType &&
        claim.valueType === 'EXPRESSION',
    ) ?? null;
  const payload = payloadBuilder(existingClaim);

  if (
    existingClaim &&
    authorizationServerClaimMatches(existingClaim, payload)
  ) {
    return {
      mode: 'existing',
      claim: existingClaim,
    };
  }

  if (existingClaim) {
    return {
      mode: 'updated',
      claim: await updateAuthorizationServerClaim(
        authServerId,
        existingClaim.id,
        payload,
      ),
    };
  }

  return {
    mode: 'created',
    claim: await createAuthorizationServerClaim(authServerId, payload),
  };
}

function buildPasswordFirstVerificationMethod(factorMode, reauthenticateIn) {
  return {
    factorMode,
    type: 'ASSURANCE',
    reauthenticateIn,
    constraints: [
      {
        knowledge: {
          required: true,
          types: ['password'],
        },
      },
    ],
  };
}

function profileAttributeMatches(existingDefinition, expectedDefinition) {
  const existingPermissions = Array.isArray(existingDefinition?.permissions)
    ? existingDefinition.permissions.map((permission) => ({
        principal: permission?.principal,
        action: permission?.action,
      }))
    : [];
  const expectedPermissions = Array.isArray(expectedDefinition?.permissions)
    ? expectedDefinition.permissions.map((permission) => ({
        principal: permission?.principal,
        action: permission?.action,
      }))
    : [];

  return (
    existingDefinition?.title === expectedDefinition.title &&
    existingDefinition?.description === expectedDefinition.description &&
    existingDefinition?.type === expectedDefinition.type &&
    existingDefinition?.minLength === expectedDefinition.minLength &&
    existingDefinition?.maxLength === expectedDefinition.maxLength &&
    existingDefinition?.scope === expectedDefinition.scope &&
    existingDefinition?.mutability === expectedDefinition.mutability &&
    existingDefinition?.master?.type === expectedDefinition.master?.type &&
    JSON.stringify(existingPermissions) === JSON.stringify(expectedPermissions)
  );
}

function authorizationServerClaimMatches(existingClaim, expectedClaim) {
  return (
    existingClaim?.name === expectedClaim.name &&
    existingClaim?.claimType === expectedClaim.claimType &&
    existingClaim?.valueType === expectedClaim.valueType &&
    existingClaim?.value === expectedClaim.value &&
    Boolean(existingClaim?.alwaysIncludeInToken) ===
      Boolean(expectedClaim.alwaysIncludeInToken) &&
    JSON.stringify(existingClaim?.conditions?.scopes ?? []) ===
      JSON.stringify(expectedClaim.conditions?.scopes ?? [])
  );
}

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
const mobileRedirectUri = toMobileRedirectUri(
  requiredString(environment.mobile?.scheme, 'mobile.scheme'),
  requiredString(environment.mobile?.redirectPath, 'mobile.redirectPath'),
);
const privacyPolicyUrl = toAbsoluteUrl(
  deployedWebBaseUrl,
  requiredString(brandProfile.privacyPolicyPath, 'brand.privacyPolicyPath'),
);
const termsUrl = toAbsoluteUrl(
  deployedWebBaseUrl,
  requiredString(brandProfile.termsPath, 'brand.termsPath'),
);
const helpUrl = toAbsoluteUrl(
  deployedWebBaseUrl,
  requiredString(brandProfile.helpPath, 'brand.helpPath'),
);
const hostedExperience = environment.okta?.hostedExperience ?? {};
const fundingStepUpMethod =
  optionalString(hostedExperience.fundingStepUpMethod) ?? 'email';
const fundingStepUpRequiresPassword =
  hostedExperience.fundingStepUpRequiresPassword === true;
const themeCookieDomain =
  optionalString(hostedExperience.themeCookieDomain) ?? '';
const authorizationServerId = resolveAuthorizationServerId(issuer);
const requiresEmailAuthenticator = Boolean(
  hostedExperience.registrationRequiresEmailVerification ||
  hostedExperience.adaptiveMfaOnSignIn ||
  hostedExperience.fundingRouteStepUp,
);

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
  PrivacyPolicyUrl: privacyPolicyUrl,
  TermsUrl: termsUrl,
  HelpUrl: helpUrl,
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

const customerGroupName = `acme-los-customers-${environment.environment}`;
const profileEnrollmentPolicyName = `ACME LOS Registration (${environment.environment})`;
const mfaEnrollmentPolicyName = `ACME LOS Authenticator Enrollment (${environment.environment})`;
const sessionPolicyName = `ACME LOS Global Session (${environment.environment})`;
const accessPolicyName = `ACME LOS App Access (${environment.environment})`;
const authorizationServerPolicyName = `ACME LOS Default Authorization (${environment.environment})`;
const authorizationServerRuleName = 'ACME LOS Default Tokens';
const defaultBrandName = requiredString(
  brandProfile.defaultBrandName,
  'brand.defaultBrandName',
);
const customerBrandName = requiredString(
  brandProfile.customerBrandName,
  'brand.customerBrandName',
);
const defaultBrandThemeProfile = brandProfile.defaultBrandTheme ?? {};

const expectedWebApp = {
  label: `ACME LOS Web (${environment.environment})`,
  applicationType: 'browser',
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  redirectUris: allowedWebBaseUrls.map((baseUrl) =>
    toAbsoluteUrl(baseUrl, webRedirectPath),
  ),
  postLogoutRedirectUris: allowedWebBaseUrls.map((baseUrl) =>
    toAbsoluteUrl(baseUrl, webPostLogoutRedirectPath),
  ),
  payload: {
    name: 'oidc_client',
    label: `ACME LOS Web (${environment.environment})`,
    signOnMode: 'OPENID_CONNECT',
    credentials: {
      oauthClient: {
        token_endpoint_auth_method: 'none',
      },
    },
    settings: {
      oauthClient: {
        application_type: 'browser',
        redirect_uris: allowedWebBaseUrls.map((baseUrl) =>
          toAbsoluteUrl(baseUrl, webRedirectPath),
        ),
        post_logout_redirect_uris: allowedWebBaseUrls.map((baseUrl) =>
          toAbsoluteUrl(baseUrl, webPostLogoutRedirectPath),
        ),
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        initiate_login_uri: deployedWebBaseUrl,
        logo_uri: toAbsoluteUrl(
          deployedWebBaseUrl,
          requiredString(brandProfile.logoPath, 'brand.logoPath'),
        ),
        tos_uri: termsUrl,
        policy_uri: privacyPolicyUrl,
      },
    },
  },
};

const expectedMobileApp = {
  label: `ACME LOS Mobile (${environment.environment})`,
  applicationType: 'native',
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  redirectUris: [mobileRedirectUri],
  postLogoutRedirectUris: [mobileRedirectUri],
  payload: {
    name: 'oidc_client',
    label: `ACME LOS Mobile (${environment.environment})`,
    signOnMode: 'OPENID_CONNECT',
    credentials: {
      oauthClient: {
        token_endpoint_auth_method: 'none',
      },
    },
    settings: {
      oauthClient: {
        application_type: 'native',
        redirect_uris: [mobileRedirectUri],
        post_logout_redirect_uris: [mobileRedirectUri],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        tos_uri: termsUrl,
        policy_uri: privacyPolicyUrl,
      },
    },
  },
};

const expectedTrustedOrigins = allowedWebBaseUrls.map((origin) => {
  const hostLabel = new URL(origin).host.replace(/[^a-z0-9]+/gi, '-');
  const name = `ACME LOS Web ${environment.environment.toUpperCase()} ${hostLabel}`;

  return {
    name,
    origin,
    scopes: ['CORS', 'REDIRECT'],
    payload: {
      name,
      origin,
      status: 'ACTIVE',
      scopes: [{ type: 'CORS' }, { type: 'REDIRECT' }],
    },
  };
});

if (dryRun) {
  writeJsonFile(bootstrapOutputsPath, {
    environment: environmentName,
    mode: 'dry-run',
    oktaApiBaseUrl,
    web: expectedWebApp.payload,
    mobile: expectedMobileApp.payload,
    trustedOrigins: expectedTrustedOrigins.map(
      (trustedOrigin) => trustedOrigin.payload,
    ),
    branding: {
      logoAssetPath: brandProfile.hostedLogoAssetPath,
      faviconAssetPath: brandProfile.hostedFaviconAssetPath,
    },
    hostedPages: {
      signIn: {
        pageContent: buildHostedSignInPageContent(hostedBranding),
      },
      error: {
        pageContent: buildHostedErrorPageContent(hostedBranding),
      },
    },
    policies: {
      customerGroupName,
      authorizationServerPolicyName,
      authorizationServerRuleName,
      profileEnrollmentPolicyName,
      mfaEnrollmentPolicyName,
      sessionPolicyName,
      accessPolicyName,
    },
    customProfileAttributes: ['leadId', 'customerId'],
    authorizationServerClaims: [
      { name: 'lead_id', claimType: 'IDENTITY', value: 'user.leadId' },
      { name: 'customer_id', claimType: 'IDENTITY', value: 'user.customerId' },
      { name: 'lead_id', claimType: 'RESOURCE', value: 'user.leadId' },
      {
        name: 'customer_id',
        claimType: 'RESOURCE',
        value: 'user.customerId',
      },
    ],
  });

  console.log(`Prepared Okta bootstrap payloads for "${environmentName}".`);
  console.log(
    `- Preview file: ${path.relative(repoRoot, bootstrapOutputsPath)}`,
  );
  process.exit(0);
}

const results = {};

for (const expectedApp of [expectedWebApp, expectedMobileApp]) {
  const existingApp = await findApplicationByLabel(expectedApp.label);
  if (existingApp) {
    const mismatches = ensureAppMatches(
      existingApp,
      expectedApp,
      expectedApp.label,
    );
    if (mismatches.length > 0) {
      const updatedApp = await updateApplication(
        existingApp.id,
        expectedApp.payload,
      );

      results[expectedApp.label] = {
        mode: 'updated',
        id: updatedApp.id,
        clientId: extractClientId(updatedApp) || extractClientId(existingApp),
        changedFields: mismatches,
      };
      continue;
    }

    results[expectedApp.label] = {
      mode: 'existing',
      id: existingApp.id,
      clientId: extractClientId(existingApp),
    };
  } else {
    const createdApp = await createApplication(expectedApp.payload);
    results[expectedApp.label] = {
      mode: 'created',
      id: createdApp.id,
      clientId: extractClientId(createdApp),
    };
  }
}

results.trustedOrigins = [];

for (const expectedTrustedOrigin of expectedTrustedOrigins) {
  const existingTrustedOrigin = await findTrustedOriginByOrigin(
    expectedTrustedOrigin.origin,
  );

  if (existingTrustedOrigin) {
    const existingScopes = (existingTrustedOrigin.scopes ?? []).map(
      (scope) => scope.type,
    );
    const missingScopes = expectedTrustedOrigin.scopes.filter(
      (scope) => !existingScopes.includes(scope),
    );

    if (
      existingTrustedOrigin.status !== 'ACTIVE' ||
      existingTrustedOrigin.name !== expectedTrustedOrigin.name ||
      missingScopes.length > 0
    ) {
      await deleteTrustedOrigin(existingTrustedOrigin);
      const recreatedTrustedOrigin = await createTrustedOrigin(
        expectedTrustedOrigin.payload,
      );
      results.trustedOrigins.push({
        mode: 'recreated',
        id: recreatedTrustedOrigin.id,
        origin: expectedTrustedOrigin.origin,
      });
      continue;
    }

    results.trustedOrigins.push({
      mode: 'existing',
      id: existingTrustedOrigin.id,
      origin: expectedTrustedOrigin.origin,
    });
    continue;
  }

  const createdTrustedOrigin = await createTrustedOrigin(
    expectedTrustedOrigin.payload,
  );
  results.trustedOrigins.push({
    mode: 'created',
    id: createdTrustedOrigin.id,
    origin: expectedTrustedOrigin.origin,
  });
}

const brands = await listBrands();
const defaultBrand =
  brands.find((brand) => brand.isDefault) ?? brands[0] ?? null;
if (!defaultBrand) {
  throw new Error('Unable to locate the default Okta brand.');
}

const updatedDefaultBrand =
  defaultBrand.name === defaultBrandName
    ? defaultBrand
    : await updateBrand(defaultBrand.id, {
        name: defaultBrandName,
        removePoweredByOkta: false,
      });
results.defaultBrand = {
  id: updatedDefaultBrand.id,
  name: updatedDefaultBrand.name,
};

const defaultBrandThemes = await listThemes(updatedDefaultBrand.id);
const defaultBrandTheme = defaultBrandThemes[0] ?? null;
if (!defaultBrandTheme) {
  throw new Error('Unable to locate the default brand theme.');
}

const updatedDefaultTheme = await updateTheme(
  updatedDefaultBrand.id,
  defaultBrandTheme.id,
  {
    primaryColorHex: requiredString(
      defaultBrandThemeProfile.primaryColor,
      'brand.defaultBrandTheme.primaryColor',
    ),
    primaryColorContrastHex: requiredString(
      defaultBrandThemeProfile.primaryContrastColor,
      'brand.defaultBrandTheme.primaryContrastColor',
    ),
    secondaryColorHex: requiredString(
      defaultBrandThemeProfile.secondaryColor,
      'brand.defaultBrandTheme.secondaryColor',
    ),
    secondaryColorContrastHex: requiredString(
      defaultBrandThemeProfile.secondaryContrastColor,
      'brand.defaultBrandTheme.secondaryContrastColor',
    ),
    signInPageTouchPointVariant:
      defaultBrandTheme.signInPageTouchPointVariant ?? 'OKTA_DEFAULT',
    endUserDashboardTouchPointVariant:
      defaultBrandTheme.endUserDashboardTouchPointVariant ?? 'OKTA_DEFAULT',
    errorPageTouchPointVariant:
      defaultBrandTheme.errorPageTouchPointVariant ?? 'OKTA_DEFAULT',
    emailTemplateTouchPointVariant:
      defaultBrandTheme.emailTemplateTouchPointVariant ?? 'OKTA_DEFAULT',
    loadingPageTouchPointVariant:
      defaultBrandTheme.loadingPageTouchPointVariant ?? 'OKTA_DEFAULT',
  },
);
results.defaultBrandTheme = { id: updatedDefaultTheme.id };
await deleteThemeAsset(updatedDefaultBrand.id, defaultBrandTheme.id, 'logo');
await deleteThemeAsset(updatedDefaultBrand.id, defaultBrandTheme.id, 'favicon');

let customerBrand =
  brands.find(
    (brand) => !brand.isDefault && brand.name === customerBrandName,
  ) ?? null;

if (!customerBrand) {
  customerBrand = await createBrand({
    name: customerBrandName,
    removePoweredByOkta: false,
    customPrivacyPolicyUrl: privacyPolicyUrl,
    agreeToCustomPrivacyPolicy: true,
  });
  results.customerBrand = {
    id: customerBrand.id,
    name: customerBrand.name,
    mode: 'created',
  };
} else {
  customerBrand = await updateBrand(customerBrand.id, {
    name: customerBrandName,
    customPrivacyPolicyUrl: privacyPolicyUrl,
    agreeToCustomPrivacyPolicy: true,
    removePoweredByOkta: false,
  });
  results.customerBrand = {
    id: customerBrand.id,
    name: customerBrand.name,
    mode: 'existing',
  };
}

const themes = await listThemes(customerBrand.id);
const defaultTheme = themes[0] ?? null;
if (!defaultTheme) {
  throw new Error('Unable to locate the customer brand theme.');
}

const updatedTheme = await updateTheme(customerBrand.id, defaultTheme.id, {
  primaryColorHex: requiredString(
    brandProfile.primaryColor,
    'brand.primaryColor',
  ),
  primaryColorContrastHex: '#ffffff',
  secondaryColorHex: requiredString(
    brandProfile.surfaceColor,
    'brand.surfaceColor',
  ),
  secondaryColorContrastHex: '#000000',
  signInPageTouchPointVariant:
    defaultTheme.signInPageTouchPointVariant ?? 'OKTA_DEFAULT',
  endUserDashboardTouchPointVariant:
    defaultTheme.endUserDashboardTouchPointVariant ?? 'OKTA_DEFAULT',
  errorPageTouchPointVariant:
    defaultTheme.errorPageTouchPointVariant ?? 'OKTA_DEFAULT',
  emailTemplateTouchPointVariant:
    defaultTheme.emailTemplateTouchPointVariant ?? 'OKTA_DEFAULT',
  loadingPageTouchPointVariant:
    defaultTheme.loadingPageTouchPointVariant ?? 'OKTA_DEFAULT',
});
results.theme = { id: updatedTheme.id };

await uploadThemeAsset(
  customerBrand.id,
  defaultTheme.id,
  'logo',
  requiredString(brandProfile.hostedLogoAssetPath, 'brand.hostedLogoAssetPath'),
);
await uploadThemeAsset(
  customerBrand.id,
  defaultTheme.id,
  'favicon',
  requiredString(
    brandProfile.hostedFaviconAssetPath,
    'brand.hostedFaviconAssetPath',
  ),
);
const customerBrandDomains = await listBrandDomains(customerBrand.id);
const hasActiveCustomDomain = customerBrandDomains.some(
  (domain) => domain.validationStatus === 'COMPLETED',
);

if (hasActiveCustomDomain) {
  const defaultSignInPage = await getDefaultSignInPage(customerBrand.id);
  await putCustomizedSignInPage(customerBrand.id, {
    pageContent: buildHostedSignInPageContent(hostedBranding),
    contentSecurityPolicySetting:
      defaultSignInPage.contentSecurityPolicySetting ?? { mode: 'enforced' },
    widgetVersion: defaultSignInPage.widgetVersion ?? '^7',
    widgetCustomizations: defaultSignInPage.widgetCustomizations ?? {},
  });
  results.customizedSignInPage = { mode: 'applied' };

  const defaultErrorPage = await getDefaultErrorPage(customerBrand.id);
  await putCustomizedErrorPage(customerBrand.id, {
    pageContent: buildHostedErrorPageContent(hostedBranding),
    contentSecurityPolicySetting:
      defaultErrorPage.contentSecurityPolicySetting ?? { mode: 'enforced' },
  });
  results.customizedErrorPage = { mode: 'applied' };
} else {
  results.customizedSignInPage = { mode: 'pending-custom-domain' };
  results.customizedErrorPage = { mode: 'pending-custom-domain' };
  warnings.push(
    'Hosted sign-in and error page HTML customization is deferred until a custom domain is mapped to the customer brand. Theme, logo, and favicon are already applied to the customer brand.',
  );
}

const authenticators = await listAuthenticators();
const emailAuthenticator =
  authenticators.find((authenticator) => authenticator.key === 'okta_email') ??
  null;
if (!emailAuthenticator) {
  throw new Error('Unable to find the Okta email authenticator.');
}

if (
  emailAuthenticator.status !== 'ACTIVE' &&
  emailAuthenticator._links?.activate?.href
) {
  await activateAuthenticator(emailAuthenticator.id);
}

const updatedEmailAuthenticator = await updateAuthenticator(
  emailAuthenticator.id,
  {
    key: emailAuthenticator.key,
    name: emailAuthenticator.name,
    settings: {
      ...(emailAuthenticator.settings ?? {}),
      allowedFor: 'any',
    },
  },
);
results.emailAuthenticator = {
  id: updatedEmailAuthenticator.id,
  allowedFor: updatedEmailAuthenticator.settings?.allowedFor ?? 'unknown',
};

const everyoneGroup = await findGroupByName('Everyone');
if (!everyoneGroup) {
  throw new Error(
    'Unable to resolve the Okta Everyone group for policy wiring.',
  );
}
const everyoneGroupId = everyoneGroup.id;

let customerGroup = await findGroupByName(customerGroupName);
if (!customerGroup) {
  customerGroup = await createGroup(
    customerGroupName,
    `Customers who register in the ACME LOS hosted experience (${environment.environment}).`,
  );
  results.customerGroup = { mode: 'created', id: customerGroup.id };
} else {
  results.customerGroup = { mode: 'existing', id: customerGroup.id };
}

const authorizationServerPolicyResult = await ensureAuthorizationServerPolicy(
  authorizationServerId,
  authorizationServerPolicyName,
  () => ({
    type: 'OAUTH_AUTHORIZATION_POLICY',
    status: 'ACTIVE',
    name: authorizationServerPolicyName,
    description: `Authorization server policy for ACME LOS web and mobile apps (${environment.environment}).`,
    priority: 1,
    conditions: {
      clients: {
        include: [
          results[expectedWebApp.label].clientId,
          results[expectedMobileApp.label].clientId,
        ],
      },
    },
  }),
);
results.authorizationServerPolicy = {
  mode: authorizationServerPolicyResult.mode,
  id: authorizationServerPolicyResult.policy.id,
};

const authorizationServerRuleResult = await ensureAuthorizationServerRule(
  authorizationServerId,
  authorizationServerPolicyResult.policy.id,
  authorizationServerRuleName,
  (existingRule) => ({
    type: 'RESOURCE_ACCESS',
    status: 'ACTIVE',
    name: existingRule?.name ?? authorizationServerRuleName,
    priority: 1,
    conditions: {
      people: {
        groups: {
          include: [everyoneGroupId],
        },
      },
      grantTypes: {
        include: ['authorization_code'],
      },
      scopes: {
        include: ['openid', 'profile', 'email', 'offline_access'],
      },
    },
    actions: {
      token: {
        accessTokenLifetimeMinutes: 60,
        refreshTokenLifetimeMinutes: 10080,
        refreshTokenWindowMinutes: 10080,
      },
    },
  }),
);
results.authorizationServerRule = {
  mode: authorizationServerRuleResult.mode,
  id: authorizationServerRuleResult.rule.id,
};

const customProfileAttributesResult = await ensureUserProfileAttributes({
  leadId: {
    title: 'Lead ID',
    description: 'ACME lead identifier used for intake attribution.',
  },
  customerId: {
    title: 'Customer ID',
    description:
      'ACME customer identifier used for portal and servicing lookups.',
  },
});
results.customProfileAttributes = {
  mode: customProfileAttributesResult.mode,
  changedAttributes: customProfileAttributesResult.changedAttributes,
};

const leadIdClaimResult = await ensureAuthorizationServerClaim(
  authorizationServerId,
  'lead_id',
  'IDENTITY',
  (existingClaim) => ({
    name: existingClaim?.name ?? 'lead_id',
    status: 'ACTIVE',
    claimType: 'IDENTITY',
    valueType: 'EXPRESSION',
    value: 'user.leadId',
    alwaysIncludeInToken: true,
    conditions: {
      scopes: [],
    },
  }),
);
results.leadIdClaim = {
  mode: leadIdClaimResult.mode,
  id: leadIdClaimResult.claim.id,
};

const customerIdClaimResult = await ensureAuthorizationServerClaim(
  authorizationServerId,
  'customer_id',
  'IDENTITY',
  (existingClaim) => ({
    name: existingClaim?.name ?? 'customer_id',
    status: 'ACTIVE',
    claimType: 'IDENTITY',
    valueType: 'EXPRESSION',
    value: 'user.customerId',
    alwaysIncludeInToken: true,
    conditions: {
      scopes: [],
    },
  }),
);
results.customerIdClaim = {
  mode: customerIdClaimResult.mode,
  id: customerIdClaimResult.claim.id,
};

const leadIdAccessClaimResult = await ensureAuthorizationServerClaim(
  authorizationServerId,
  'lead_id',
  'RESOURCE',
  (existingClaim) => ({
    name: existingClaim?.name ?? 'lead_id',
    status: 'ACTIVE',
    claimType: 'RESOURCE',
    valueType: 'EXPRESSION',
    value: 'user.leadId',
    alwaysIncludeInToken: true,
    conditions: {
      scopes: [],
    },
  }),
);
results.leadIdAccessClaim = {
  mode: leadIdAccessClaimResult.mode,
  id: leadIdAccessClaimResult.claim.id,
};

const customerIdAccessClaimResult = await ensureAuthorizationServerClaim(
  authorizationServerId,
  'customer_id',
  'RESOURCE',
  (existingClaim) => ({
    name: existingClaim?.name ?? 'customer_id',
    status: 'ACTIVE',
    claimType: 'RESOURCE',
    valueType: 'EXPRESSION',
    value: 'user.customerId',
    alwaysIncludeInToken: true,
    conditions: {
      scopes: [],
    },
  }),
);
results.customerIdAccessClaim = {
  mode: customerIdAccessClaimResult.mode,
  id: customerIdAccessClaimResult.claim.id,
};

const profileEnrollmentPolicyResult = await ensurePolicy(
  'PROFILE_ENROLLMENT',
  profileEnrollmentPolicyName,
  (existingPolicy) => ({
    type: 'PROFILE_ENROLLMENT',
    status: 'ACTIVE',
    name: profileEnrollmentPolicyName,
    description: `Hosted registration policy for ACME LOS (${environment.environment}).`,
    conditions: existingPolicy?.conditions ?? null,
  }),
);

results.profileEnrollmentPolicy = {
  mode: profileEnrollmentPolicyResult.mode,
  id: profileEnrollmentPolicyResult.policy.id,
};

const profileEnrollmentRules = await listPolicyRules(
  profileEnrollmentPolicyResult.policy.id,
);
const profileEnrollmentRule = getCatchAllRule(profileEnrollmentRules);
results.profileEnrollmentRule = {
  mode: profileEnrollmentRule ? 'existing' : 'unmanaged',
  id: profileEnrollmentRule?.id ?? null,
};
warnings.push(
  'Profile enrollment stays on the Okta-managed catch-all rule in this org because the rule API blocks automated replacement. Keep self-service registration enabled there, and use app assignment plus access policy wiring to let newly registered customers reach the app.',
);

const mfaPolicyResult = await ensurePolicy(
  'MFA_ENROLL',
  mfaEnrollmentPolicyName,
  () => ({
    type: 'MFA_ENROLL',
    status: 'ACTIVE',
    name: mfaEnrollmentPolicyName,
    description: `Authenticator enrollment policy for ACME LOS customers (${environment.environment}).`,
    conditions: {
      people: {
        groups: {
          include: [everyoneGroupId],
        },
      },
    },
    settings: {
      type: 'AUTHENTICATORS',
      authenticators: [
        {
          key: 'okta_email',
          enroll: {
            self: requiresEmailAuthenticator ? 'REQUIRED' : 'OPTIONAL',
          },
        },
        {
          key: 'okta_password',
          enroll: {
            self: 'REQUIRED',
          },
        },
      ],
    },
  }),
);
results.mfaEnrollmentPolicy = {
  mode: mfaPolicyResult.mode,
  id: mfaPolicyResult.policy.id,
};

const mfaRuleResult = await ensureRule(
  mfaPolicyResult.policy.id,
  'ACME LOS Enrollment',
  (existingRule) => ({
    type: 'MFA_ENROLL',
    name: existingRule?.name ?? 'ACME LOS Enrollment',
    status: 'ACTIVE',
    ...(existingRule
      ? {}
      : {
          conditions: {
            people: {
              users: {
                exclude: [],
              },
            },
            network: {
              connection: 'ANYWHERE',
            },
          },
        }),
    actions: {
      enroll: {
        self: 'CHALLENGE',
      },
    },
  }),
);
results.mfaEnrollmentRule = {
  mode: mfaRuleResult.mode,
  id: mfaRuleResult.rule.id,
};

const sessionPolicyResult = await ensurePolicy(
  'OKTA_SIGN_ON',
  sessionPolicyName,
  () => ({
    type: 'OKTA_SIGN_ON',
    status: 'ACTIVE',
    name: sessionPolicyName,
    description: `Global session policy for ACME LOS customers (${environment.environment}).`,
    conditions: {
      people: {
        groups: {
          include: [everyoneGroupId],
        },
      },
    },
  }),
);
results.sessionPolicy = {
  mode: sessionPolicyResult.mode,
  id: sessionPolicyResult.policy.id,
};

const sessionRuleResult = await ensureRule(
  sessionPolicyResult.policy.id,
  'ACME LOS Customer Session',
  (existingRule) => ({
    type: 'SIGN_ON',
    name: existingRule?.name ?? 'ACME LOS Customer Session',
    status: 'ACTIVE',
    ...(existingRule
      ? {}
      : {
          conditions: {
            people: {
              users: {
                exclude: [],
              },
            },
            network: {
              connection: 'ANYWHERE',
            },
            authContext: {
              authType: 'ANY',
            },
          },
        }),
    actions: {
      signon: {
        access: 'ALLOW',
        requireFactor: false,
        primaryFactor: 'PASSWORD_IDP_ANY_FACTOR',
        rememberDeviceByDefault: Boolean(hostedExperience.rememberUser),
        session: {
          usePersistentCookie: Boolean(hostedExperience.keepMeSignedIn),
          maxSessionIdleMinutes: 120,
          maxSessionLifetimeMinutes: 10080,
        },
      },
    },
  }),
);
results.sessionRule = {
  mode: sessionRuleResult.mode,
  id: sessionRuleResult.rule.id,
};

const accessPolicyResult = await ensurePolicy(
  'ACCESS_POLICY',
  accessPolicyName,
  () => ({
    type: 'ACCESS_POLICY',
    status: 'ACTIVE',
    name: accessPolicyName,
    description: `App sign-in policy for ACME LOS web and mobile apps (${environment.environment}).`,
    conditions: null,
  }),
);
results.accessPolicy = {
  mode: accessPolicyResult.mode,
  id: accessPolicyResult.policy.id,
};
results.fundingStepUpPolicyIntent = {
  method: fundingStepUpMethod,
  requiresPassword: fundingStepUpRequiresPassword,
};

if (hostedExperience.adaptiveMfaOnSignIn) {
  try {
    const adaptiveRuleResult = await ensureRule(
      accessPolicyResult.policy.id,
      'ACME LOS High-risk Access',
      (existingRule) => ({
        ...(existingRule?.id ? { id: existingRule.id } : {}),
        type: 'ACCESS_POLICY',
        name: existingRule?.name ?? 'ACME LOS High-risk Access',
        status: 'ACTIVE',
        priority: 1,
        conditions: {
          riskScore: {
            level: 'HIGH',
          },
        },
        actions: {
          appSignOn: {
            access: 'ALLOW',
            verificationMethod: buildPasswordFirstVerificationMethod(
              '2FA',
              'PT2H',
            ),
            keepMeSignedIn: {
              postAuth: 'NOT_ALLOWED',
            },
          },
        },
      }),
    );
    results.highRiskAccessRule = {
      mode: adaptiveRuleResult.mode,
      id: adaptiveRuleResult.rule.id,
    };
  } catch (error) {
    warnings.push(
      `Adaptive high-risk sign-in rule was not applied automatically. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const standardAccessRuleResult = await ensureRule(
  accessPolicyResult.policy.id,
  'ACME LOS Standard Access',
  (existingRule) => ({
    ...(existingRule?.id ? { id: existingRule.id } : {}),
    type: 'ACCESS_POLICY',
    name: existingRule?.name ?? 'ACME LOS Standard Access',
    status: 'ACTIVE',
    priority: hostedExperience.adaptiveMfaOnSignIn ? 2 : 1,
    conditions: null,
    actions: {
      appSignOn: {
        access: 'ALLOW',
        verificationMethod: buildPasswordFirstVerificationMethod(
          '1FA',
          'PT12H',
        ),
        keepMeSignedIn: hostedExperience.keepMeSignedIn
          ? {
              postAuth: 'ALLOWED',
              postAuthPromptFrequency: 'PT168H',
            }
          : {
              postAuth: 'NOT_ALLOWED',
            },
      },
    },
  }),
);
results.standardAccessRule = {
  mode: standardAccessRuleResult.mode,
  id: standardAccessRuleResult.rule.id,
};

for (const appResult of [
  results[expectedWebApp.label],
  results[expectedMobileApp.label],
]) {
  await assignPolicyToApp(appResult.id, accessPolicyResult.policy.id);
  await assignPolicyToApp(
    appResult.id,
    profileEnrollmentPolicyResult.policy.id,
  );
  await assignGroupToApplication(appResult.id, everyoneGroupId);
}
results.applicationAssignmentGroupId = everyoneGroupId;

if (hostedExperience.rememberUser) {
  warnings.push(
    'The pre-auth remember-user checkbox is still controlled by Okta org settings. This bootstrap wires KMSI/session policy behavior, but the checkbox itself should still be verified once in the Admin Console.',
  );
}

if (hostedExperience.fundingRouteStepUp) {
  warnings.push(
    `Funding step-up remains enforced in application code through acr_values on the guarded funding step. The runtime request no longer forces prompt=login/max_age=0, so an existing password session can satisfy the password portion while Okta presents the configured ${fundingStepUpMethod} step-up factor. Verify this behavior once after publishing the hosted page and policy changes.`,
  );
}

environment.okta.webClientId = results[expectedWebApp.label].clientId;
environment.okta.mobileClientId = results[expectedMobileApp.label].clientId;
writeJsonFile(environmentPath, environment);
writeJsonFile(bootstrapOutputsPath, {
  environment: environmentName,
  oktaApiBaseUrl,
  webAppId: results[expectedWebApp.label].id,
  webClientId: results[expectedWebApp.label].clientId,
  mobileAppId: results[expectedMobileApp.label].id,
  mobileClientId: results[expectedMobileApp.label].clientId,
  trustedOriginId: results.trustedOrigins[0]?.id ?? '',
  trustedOriginIds: results.trustedOrigins.map(
    (trustedOrigin) => trustedOrigin.id,
  ),
  trustedOrigins: results.trustedOrigins,
  defaultBrandId: results.defaultBrand.id,
  defaultBrandThemeId: results.defaultBrandTheme.id,
  customerBrandId: results.customerBrand.id,
  themeId: results.theme.id,
  customizedSignInPageMode: results.customizedSignInPage.mode,
  customizedErrorPageMode: results.customizedErrorPage.mode,
  customerGroupId: results.customerGroup.id,
  applicationAssignmentGroupId: results.applicationAssignmentGroupId,
  authorizationServerPolicyId: results.authorizationServerPolicy.id,
  authorizationServerRuleId: results.authorizationServerRule.id,
  customProfileAttributes: results.customProfileAttributes,
  leadIdClaimId: results.leadIdClaim.id,
  customerIdClaimId: results.customerIdClaim.id,
  leadIdAccessClaimId: results.leadIdAccessClaim.id,
  customerIdAccessClaimId: results.customerIdAccessClaim.id,
  profileEnrollmentPolicyId: results.profileEnrollmentPolicy.id,
  mfaEnrollmentPolicyId: results.mfaEnrollmentPolicy.id,
  sessionPolicyId: results.sessionPolicy.id,
  accessPolicyId: results.accessPolicy.id,
  fundingStepUpPolicyIntent: results.fundingStepUpPolicyIntent,
  warnings,
});

renderEnvironment();

console.log(`Bootstrapped Okta resources for "${environmentName}".`);
console.log(
  `- Web app (${results[expectedWebApp.label].mode}): ${results[expectedWebApp.label].clientId}`,
);
console.log(
  `- Mobile app (${results[expectedMobileApp.label].mode}): ${results[expectedMobileApp.label].clientId}`,
);
console.log(
  `- Trusted origins: ${results.trustedOrigins.map((trustedOrigin) => `${trustedOrigin.origin} (${trustedOrigin.mode})`).join(', ')}`,
);
console.log(`- Default brand: ${results.defaultBrand.name}`);
console.log(
  `- Customer brand (${results.customerBrand.mode}): ${results.customerBrand.name}`,
);
console.log(
  `- Custom profile attributes (${results.customProfileAttributes.mode}): leadId, customerId`,
);
console.log(
  `- ID token claims: lead_id=${results.leadIdClaim.id}, customer_id=${results.customerIdClaim.id}`,
);
console.log(
  `- Access token claims: lead_id=${results.leadIdAccessClaim.id}, customer_id=${results.customerIdAccessClaim.id}`,
);
console.log(`- Hosted sign-in page: ${results.customizedSignInPage.mode}`);
console.log(`- Hosted error page: ${results.customizedErrorPage.mode}`);
console.log(`- Customer group: ${results.customerGroup.id}`);
console.log(
  `- Authorization server policy: ${results.authorizationServerPolicy.id}`,
);
console.log(
  `- Authorization server rule: ${results.authorizationServerRule.id}`,
);
console.log(`- Access policy: ${results.accessPolicy.id}`);
if (warnings.length > 0) {
  console.log('- Warnings:');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

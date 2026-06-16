import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildAccountManagementPolicyRuleDefinitions,
  findAccountManagementPolicy,
  printAccountManagementPolicyRules,
  summarizeAccountManagementPolicyRules,
} from './account-management-policy.mjs';
import {
  buildHostedErrorPageContent,
  buildHostedSignInPageContent,
  buildHostedSignInStartUrl,
} from './hosted-sign-in-page.mjs';
import { buildOktaPolicyPlan, printOktaPolicyPlan } from './policy-plan.mjs';

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

const oktaManagementAccessToken =
  process.env.OKTA_MANAGEMENT_ACCESS_TOKEN?.trim();
const oktaApiToken = process.env.OKTA_API_TOKEN?.trim();

if (!dryRun && !oktaManagementAccessToken && !oktaApiToken) {
  console.error(
    'Set OKTA_MANAGEMENT_ACCESS_TOKEN or OKTA_API_TOKEN before running the Okta bootstrap script.',
  );
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const brandProfile = JSON.parse(fs.readFileSync(brandProfilePath, 'utf8'));
const oktaAuthorizationHeader = oktaManagementAccessToken
  ? `Bearer ${oktaManagementAccessToken}`
  : oktaApiToken
    ? `SSWS ${oktaApiToken}`
    : '';
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const warnings = [];

function isReadOnlyConditionsError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('E0000077') ||
    (message.includes('conditions') && message.includes('read-only'))
  );
}

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

function optionalPositiveInteger(value) {
  if (!Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
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
  const method = optionalString(value)?.toLowerCase() ?? 'email';

  if (!['email', 'sms'].includes(method)) {
    throw new Error(
      'Expected okta.hostedExperience.fundingStepUpMethod to be "email" or "sms".',
    );
  }

  return method;
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

const registrationProfileAttributes = [
  { name: 'email', label: 'Primary email', required: true, uiFormat: 'text' },
  { name: 'firstName', label: 'First name', required: true },
  { name: 'lastName', label: 'Last name', required: true },
  {
    name: 'mobilePhone',
    label: 'Phone number',
    required: true,
    inputValidation: { format: 'phone' },
    uiFormat: 'text',
  },
  { name: 'acmeState', label: 'State', required: true, uiFormat: 'select' },
];

const registrationEnrollmentAuthenticatorTypes = ['password'];
const customerMyAccountOauthScopes = [
  'okta.myAccount.email.read',
  'okta.myAccount.email.manage',
  'okta.myAccount.phone.read',
  'okta.myAccount.phone.manage',
];
const customerWebOauthScopes = [
  'openid',
  'profile',
  'email',
  'offline_access',
  ...customerMyAccountOauthScopes,
];

const supportedStateOptions = [
  ['MO', 'Missouri'],
  ['TX', 'Texas'],
].map(([value, label]) => ({ value, label }));

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
      Authorization: oktaAuthorizationHeader,
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

async function getCustomizedSignInPage(brandId) {
  return oktaRequest(
    'GET',
    `/api/v1/brands/${brandId}/pages/sign-in/customized`,
  );
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

async function getCustomizedErrorPage(brandId) {
  return oktaRequest('GET', `/api/v1/brands/${brandId}/pages/error/customized`);
}

async function putCustomizedErrorPage(brandId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/brands/${brandId}/pages/error/customized`,
    payload,
  );
}

function assertCustomizedPagePersisted({
  actualPage,
  expectedPageContent,
  label,
  markers,
  expectedWidgetVersion,
  expectedWidgetGeneration,
}) {
  const actualPageContent = actualPage?.pageContent ?? '';
  if (actualPageContent.length === 0) {
    throw new Error(
      `Okta accepted the ${label} customization request, but the persisted pageContent is empty.`,
    );
  }

  const minimumExpectedLength = Math.floor(expectedPageContent.length * 0.9);
  if (actualPageContent.length < minimumExpectedLength) {
    throw new Error(
      `Okta persisted a truncated ${label} page (${actualPageContent.length} chars, expected at least ${minimumExpectedLength}).`,
    );
  }

  const missingMarkers = markers.filter(
    (marker) => !actualPageContent.includes(marker),
  );
  if (missingMarkers.length > 0) {
    throw new Error(
      `Okta persisted the ${label} page without required marker(s): ${missingMarkers.join(', ')}.`,
    );
  }

  if (expectedWidgetGeneration) {
    const actualWidgetGeneration =
      actualPage?.widgetCustomizations?.widgetGeneration ?? '';
    if (actualWidgetGeneration !== expectedWidgetGeneration) {
      throw new Error(
        `Okta persisted the ${label} page with widgetGeneration="${actualWidgetGeneration || 'missing'}", expected "${expectedWidgetGeneration}".`,
      );
    }
  }

  if (expectedWidgetVersion) {
    const actualWidgetVersion = actualPage?.widgetVersion ?? '';
    if (actualWidgetVersion !== expectedWidgetVersion) {
      throw new Error(
        `Okta persisted the ${label} page with widgetVersion="${actualWidgetVersion || 'missing'}", expected "${expectedWidgetVersion}".`,
      );
    }
  }
}

async function putAndVerifyCustomizedSignInPage(brandId, payload) {
  await putCustomizedSignInPage(brandId, payload);
  const persistedPage = await getCustomizedSignInPage(brandId);
  assertCustomizedPagePersisted({
    actualPage: persistedPage,
    expectedPageContent: payload.pageContent,
    label: 'hosted sign-in',
    markers: ['okta-login-container', 'OktaUtil.getSignInWidgetConfig'],
    expectedWidgetVersion: payload.widgetVersion,
    expectedWidgetGeneration: payload.widgetCustomizations?.widgetGeneration,
  });
  return persistedPage;
}

async function putAndVerifyCustomizedErrorPage(brandId, payload) {
  await putCustomizedErrorPage(brandId, payload);
  const persistedPage = await getCustomizedErrorPage(brandId);
  assertCustomizedPagePersisted({
    actualPage: persistedPage,
    expectedPageContent: payload.pageContent,
    label: 'hosted error',
    markers: ['acme-error-shell', 'acme-error-card'],
  });
  return persistedPage;
}

async function listAuthenticators() {
  return oktaRequest('GET', '/api/v1/authenticators');
}

async function createAuthenticator(payload) {
  return oktaRequest('POST', '/api/v1/authenticators', payload, {
    activate: 'true',
  });
}

async function activateAuthenticator(authenticatorId) {
  return oktaRequest(
    'POST',
    `/api/v1/authenticators/${authenticatorId}/lifecycle/activate`,
  );
}

async function deactivateAuthenticator(authenticatorId) {
  return oktaRequest(
    'POST',
    `/api/v1/authenticators/${authenticatorId}/lifecycle/deactivate`,
  );
}

async function listAuthenticatorMethods(authenticatorId) {
  return oktaRequest(
    'GET',
    `/api/v1/authenticators/${authenticatorId}/methods`,
  );
}

async function activateAuthenticatorMethod(authenticatorId, methodType) {
  return oktaRequest(
    'POST',
    `/api/v1/authenticators/${authenticatorId}/methods/${methodType}/lifecycle/activate`,
  );
}

async function deactivateAuthenticatorMethod(authenticatorId, methodType) {
  return oktaRequest(
    'POST',
    `/api/v1/authenticators/${authenticatorId}/methods/${methodType}/lifecycle/deactivate`,
  );
}

async function updateAuthenticator(authenticatorId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/authenticators/${authenticatorId}`,
    payload,
  );
}

async function ensureAuthenticator({
  authenticators,
  key,
  name,
  type,
  allowedFor = 'any',
}) {
  let authenticator =
    authenticators.find((candidate) => candidate.key === key) ?? null;

  if (!authenticator) {
    authenticator = await createAuthenticator({
      key,
      name,
      type,
    });
  } else if (
    authenticator.status !== 'ACTIVE' &&
    authenticator._links?.activate?.href
  ) {
    authenticator = await activateAuthenticator(authenticator.id);
  }

  return updateAuthenticator(authenticator.id, {
    key: authenticator.key,
    name: authenticator.name,
    settings: {
      ...(authenticator.settings ?? {}),
      allowedFor,
    },
  });
}

function buildAuthenticatorEnrollment({ key, required }) {
  return {
    key,
    enroll: {
      self: required ? 'REQUIRED' : 'OPTIONAL',
    },
  };
}

async function listInlineHooks(type) {
  return oktaRequest('GET', '/api/v1/inlineHooks', undefined, {
    type,
  });
}

async function createInlineHook(payload) {
  return oktaRequest('POST', '/api/v1/inlineHooks', payload);
}

async function updateInlineHook(inlineHookId, payload) {
  return oktaRequest('PUT', `/api/v1/inlineHooks/${inlineHookId}`, payload);
}

async function activateInlineHook(inlineHookId) {
  return oktaRequest(
    'POST',
    `/api/v1/inlineHooks/${inlineHookId}/lifecycle/activate`,
  );
}

async function deactivateInlineHook(inlineHookId) {
  return oktaRequest(
    'POST',
    `/api/v1/inlineHooks/${inlineHookId}/lifecycle/deactivate`,
  );
}

async function ensureTelephonyInlineHook(expected) {
  const hooks = await listInlineHooks('com.okta.telephony.provider');
  const existingHook =
    hooks.find((hook) => hook.name === expected.name) ?? null;
  const conflictingActiveHook =
    hooks.find(
      (hook) => hook.status === 'ACTIVE' && hook.id !== existingHook?.id,
    ) ?? null;

  if (conflictingActiveHook) {
    throw new Error(
      `Okta org already has active telephony inline hook "${conflictingActiveHook.name}". An org can have only one active telephony inline hook.`,
    );
  }

  const result = existingHook
    ? {
        mode: 'updated',
        hook: await updateInlineHook(existingHook.id, expected.payload),
      }
    : {
        mode: 'created',
        hook: await createInlineHook(expected.payload),
      };

  if (result.hook.status !== 'ACTIVE') {
    result.hook = await activateInlineHook(result.hook.id);
  }

  return result;
}

async function disableManagedTelephonyInlineHook(expectedName) {
  const hooks = await listInlineHooks('com.okta.telephony.provider');
  const existingHook = hooks.find((hook) => hook.name === expectedName) ?? null;

  if (!existingHook) {
    return { mode: 'not-found' };
  }

  if (existingHook.status !== 'ACTIVE') {
    return { mode: 'disabled', id: existingHook.id };
  }

  const hook = await deactivateInlineHook(existingHook.id);
  return { mode: 'disabled', id: hook.id };
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

async function unassignGroupFromApplication(appId, groupId) {
  const url = new URL(
    `/api/v1/apps/${appId}/groups/${groupId}`,
    oktaApiBaseUrl,
  );
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: oktaAuthorizationHeader,
    },
  });

  if (response.status === 404) {
    return { mode: 'not-assigned', groupId };
  }

  if (!response.ok) {
    let details = '';
    try {
      details = JSON.stringify(await response.json());
    } catch {
      details = await response.text();
    }

    throw new Error(
      `Okta DELETE ${url.pathname} failed with ${response.status}: ${details}`,
    );
  }

  return { mode: 'removed', groupId };
}

async function getDefaultUserSchema() {
  return oktaRequest('GET', '/api/v1/meta/schemas/user/default');
}

async function updateDefaultUserSchema(payload) {
  return oktaRequest('POST', '/api/v1/meta/schemas/user/default', payload);
}

async function getUiSchema(uiSchemaId) {
  return oktaRequest('GET', `/api/v1/meta/uischemas/${uiSchemaId}`);
}

async function updateUiSchema(uiSchemaId, payload) {
  return oktaRequest('PUT', `/api/v1/meta/uischemas/${uiSchemaId}`, payload);
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

async function listAuthorizationServerScopes(authServerId) {
  return oktaRequest(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/scopes`,
  );
}

async function createAuthorizationServerScope(authServerId, payload) {
  return oktaRequest(
    'POST',
    `/api/v1/authorizationServers/${authServerId}/scopes`,
    payload,
  );
}

async function updateAuthorizationServerScope(authServerId, scopeId, payload) {
  return oktaRequest(
    'PUT',
    `/api/v1/authorizationServers/${authServerId}/scopes/${scopeId}`,
    payload,
  );
}

async function listAuthorizationServerClaims(authServerId) {
  return oktaRequest(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/claims`,
  );
}

function buildAuthorizationServerScopePayload(scopeName) {
  return {
    name: scopeName,
    displayName: scopeName,
    description:
      'Reserved Okta MyAccount scope used by ACME account-security flows.',
    consent: 'IMPLICIT',
    default: false,
    metadataPublish: 'NO_CLIENTS',
  };
}

function authorizationServerScopeMatches(existingScope, expectedScope) {
  return (
    existingScope?.name === expectedScope.name &&
    existingScope?.displayName === expectedScope.displayName &&
    existingScope?.description === expectedScope.description &&
    existingScope?.consent === expectedScope.consent &&
    Boolean(existingScope?.default) === Boolean(expectedScope.default)
  );
}

async function ensureAuthorizationServerScope(authServerId, scopeName) {
  const scopes = await listAuthorizationServerScopes(authServerId);
  const existingScope =
    scopes.find((scope) => scope.name === scopeName) ?? null;
  const payload = buildAuthorizationServerScopePayload(scopeName);

  if (
    existingScope &&
    authorizationServerScopeMatches(existingScope, payload)
  ) {
    return {
      mode: 'existing',
      scope: existingScope,
    };
  }

  if (existingScope) {
    return {
      mode: 'updated',
      scope: await updateAuthorizationServerScope(
        authServerId,
        existingScope.id,
        payload,
      ),
    };
  }

  return {
    mode: 'created',
    scope: await createAuthorizationServerScope(authServerId, payload),
  };
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

function buildAuthorizationServerPolicyPayload({
  policyName,
  clientIds,
  environmentName,
}) {
  return {
    type: 'OAUTH_AUTHORIZATION_POLICY',
    status: 'ACTIVE',
    name: policyName,
    description: `Authorization server policy for ACME LOS web and mobile apps (${environmentName}).`,
    priority: 1,
    conditions: {
      clients: {
        include: clientIds,
      },
    },
  };
}

function buildAuthorizationServerRulePayload({
  existingRule,
  ruleName,
  groupId,
}) {
  return {
    type: 'RESOURCE_ACCESS',
    status: 'ACTIVE',
    name: existingRule?.name ?? ruleName,
    priority: 1,
    conditions: {
      people: {
        groups: {
          include: [groupId],
        },
      },
      grantTypes: {
        include: ['authorization_code'],
      },
      scopes: {
        include: customerWebOauthScopes,
      },
    },
    actions: {
      token: {
        accessTokenLifetimeMinutes: 60,
        refreshTokenLifetimeMinutes: 10080,
        refreshTokenWindowMinutes: 10080,
      },
    },
  };
}

function buildProfileEnrollmentPolicyPayload({
  existingPolicy,
  policyName,
  environmentName,
}) {
  return {
    type: 'PROFILE_ENROLLMENT',
    status: 'ACTIVE',
    name: policyName,
    description: `Hosted registration policy for ACME LOS (${environmentName}).`,
    conditions: existingPolicy?.conditions ?? null,
  };
}

function buildRegistrationProfileAttributes(existingAttributes = []) {
  const currentAttributes = Array.isArray(existingAttributes)
    ? existingAttributes
    : [];
  const managedNames = new Set(
    registrationProfileAttributes.map((attribute) => attribute.name),
  );
  const existingByName = new Map(
    currentAttributes
      .filter((attribute) => typeof attribute?.name === 'string')
      .map((attribute) => [attribute.name, attribute]),
  );
  const managedAttributes = registrationProfileAttributes.map((attribute) => {
    const policyAttribute = { ...attribute };
    delete policyAttribute.uiFormat;

    return {
      ...(existingByName.get(attribute.name) ?? {}),
      ...policyAttribute,
    };
  });
  const unmanagedAttributes = currentAttributes.filter(
    (attribute) => !managedNames.has(attribute?.name),
  );

  return [...managedAttributes, ...unmanagedAttributes];
}

function toProfileEnrollmentUiElement(attribute) {
  return {
    type: 'Control',
    scope: `#/properties/${attribute.name}`,
    label: attribute.label,
    options: {
      format: attribute.uiFormat ?? 'text',
    },
  };
}

function buildProfileEnrollmentUiSchema(existingUiSchema = {}) {
  return {
    uiSchema: {
      type: existingUiSchema.type ?? 'Group',
      label: existingUiSchema.label ?? 'Sign in',
      buttonLabel: existingUiSchema.buttonLabel ?? 'Submit',
      elements: registrationProfileAttributes.map(toProfileEnrollmentUiElement),
    },
  };
}

function readUiSchemaAttributeNames(uiSchema) {
  const elements = uiSchema?.elements ?? [];

  return Array.isArray(elements)
    ? elements
        .map((element) =>
          optionalString(element?.scope)?.replace(/^#\/properties\//, ''),
        )
        .filter((name) => typeof name === 'string')
    : [];
}

function profileEnrollmentUiSchemaMatches(uiSchema) {
  const expectedElements = registrationProfileAttributes.map(
    toProfileEnrollmentUiElement,
  );
  const currentElements = uiSchema?.elements ?? [];

  if (
    !Array.isArray(currentElements) ||
    currentElements.length !== expectedElements.length
  ) {
    return false;
  }

  return expectedElements.every((expectedElement, index) => {
    const currentElement = currentElements[index];

    return (
      currentElement?.type === expectedElement.type &&
      currentElement?.scope === expectedElement.scope &&
      currentElement?.label === expectedElement.label &&
      currentElement?.options?.format === expectedElement.options.format
    );
  });
}

function readProfileEnrollmentAttributeNames(rule) {
  const profileAttributes =
    rule?.actions?.profileEnrollment?.profileAttributes ?? [];

  return Array.isArray(profileAttributes)
    ? profileAttributes
        .map((attribute) => optionalString(attribute?.name))
        .filter((name) => typeof name === 'string')
    : [];
}

function readProfileEnrollmentAuthenticatorTypes(rule) {
  const authenticatorTypes =
    rule?.actions?.profileEnrollment?.enrollAuthenticatorTypes ?? [];

  return Array.isArray(authenticatorTypes)
    ? authenticatorTypes.filter((type) => typeof type === 'string')
    : [];
}

function profileEnrollmentManagedAttributesMatch(rule) {
  const profileAttributes =
    rule?.actions?.profileEnrollment?.profileAttributes ?? [];

  if (!Array.isArray(profileAttributes)) {
    return false;
  }

  const existingByName = new Map(
    profileAttributes
      .filter((attribute) => typeof attribute?.name === 'string')
      .map((attribute) => [attribute.name, attribute]),
  );

  return registrationProfileAttributes.every((expectedAttribute) => {
    const existingAttribute = existingByName.get(expectedAttribute.name);

    return (
      existingAttribute &&
      Boolean(existingAttribute.required) ===
        Boolean(expectedAttribute.required)
    );
  });
}

function profileEnrollmentAuthenticatorTypesMatch(rule) {
  return arraysEqualAsSets(
    readProfileEnrollmentAuthenticatorTypes(rule),
    registrationEnrollmentAuthenticatorTypes,
  );
}

function buildProfileEnrollmentRulePayload(existingRule, customerGroupId) {
  const profileEnrollment = existingRule?.actions?.profileEnrollment ?? {};

  return {
    type: 'PROFILE_ENROLLMENT',
    name: existingRule?.name ?? 'Catch-all Rule',
    status: 'ACTIVE',
    ...(typeof existingRule?.priority === 'number'
      ? { priority: existingRule.priority }
      : {}),
    ...(existingRule?.conditions
      ? { conditions: existingRule.conditions }
      : {}),
    actions: {
      ...(existingRule?.actions ?? {}),
      profileEnrollment: {
        ...profileEnrollment,
        access: profileEnrollment.access ?? 'ALLOW',
        activationRequirements: {
          ...(profileEnrollment.activationRequirements ?? {}),
          emailVerification: Boolean(
            hostedExperience.registrationRequiresEmailVerification,
          ),
        },
        profileAttributes: buildRegistrationProfileAttributes(
          profileEnrollment.profileAttributes,
        ),
        enrollAuthenticatorTypes: registrationEnrollmentAuthenticatorTypes,
        targetGroupIds: [customerGroupId],
        unknownUserAction: profileEnrollment.unknownUserAction ?? 'REGISTER',
      },
    },
  };
}

function readProfileEnrollmentTargetGroupIds(rule) {
  const targetGroupIds = rule?.actions?.profileEnrollment?.targetGroupIds;

  return Array.isArray(targetGroupIds) ? targetGroupIds : [];
}

function describeProfileEnrollmentManualGate({
  customerGroupId,
  customerGroupName,
  missingEnrollmentAuthenticatorTypes = [],
  missingProfileAttributes = [],
  profileEnrollmentPolicyName,
  ruleName,
}) {
  const fieldMessage =
    missingProfileAttributes.length > 0
      ? ` Add the missing required registration profile fields: ${missingProfileAttributes.join(', ')}.`
      : '';
  const authenticatorMessage =
    missingEnrollmentAuthenticatorTypes.length > 0
      ? ` Add the missing registration authenticator enrollment types: ${missingEnrollmentAuthenticatorTypes.join(', ')}.`
      : '';

  return [
    `Okta refused API ownership of the profile-enrollment registration rule "${ruleName}" for ${profileEnrollmentPolicyName}.`,
    `Manual gate: in Okta Admin, open Security > User Profile Policies > ${profileEnrollmentPolicyName}, edit the registration rule, verify the target group is ${customerGroupName} (${customerGroupId}), and verify the required hosted registration profile fields and password enrollment match the repo.${fieldMessage}${authenticatorMessage}`,
    'Do not assign the ACME app to Everyone as a workaround; that broadens app access beyond the customer population.',
  ].join(' ');
}

function buildMfaEnrollmentPolicyPayload({
  policyName,
  environmentName,
  customerGroupId,
}) {
  return {
    type: 'MFA_ENROLL',
    status: 'ACTIVE',
    name: policyName,
    description: `Authenticator enrollment policy for ACME LOS customers (${environmentName}).`,
    conditions: {
      people: {
        groups: {
          include: [customerGroupId],
        },
      },
    },
    settings: {
      type: 'AUTHENTICATORS',
      authenticators: [
        buildAuthenticatorEnrollment({
          key: 'okta_email',
          required: requiresEmailAuthenticator,
        }),
        buildAuthenticatorEnrollment({
          key: 'okta_password',
          required: true,
        }),
        buildAuthenticatorEnrollment({
          key: 'security_question',
          required: requiresSecurityQuestionAuthenticator,
        }),
        ...(telephonyEnabled
          ? [
              buildAuthenticatorEnrollment({
                key: 'phone_number',
                required: requiresPhoneAuthenticator,
              }),
            ]
          : []),
      ],
    },
  };
}

function buildMfaEnrollmentRulePayload(existingRule) {
  return {
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
  };
}

function buildSessionPolicyPayload({
  policyName,
  environmentName,
  customerGroupId,
}) {
  return {
    type: 'OKTA_SIGN_ON',
    status: 'ACTIVE',
    name: policyName,
    description: `Global session policy for ACME LOS customers (${environmentName}).`,
    conditions: {
      people: {
        groups: {
          include: [customerGroupId],
        },
      },
    },
  };
}

function buildSessionRulePayload(existingRule) {
  return {
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
          maxSessionLifetimeMinutes: customerSessionMaxLifetimeMinutes,
        },
      },
    },
  };
}

function buildPasswordPolicyPayload({
  policyName,
  environmentName,
  customerGroupId,
}) {
  return {
    type: 'PASSWORD',
    status: 'ACTIVE',
    name: policyName,
    description: `Password recovery policy for ACME LOS customers (${environmentName}).`,
    conditions: {
      people: {
        groups: {
          include: [customerGroupId],
        },
      },
      authProvider: {
        provider: 'OKTA',
      },
    },
  };
}

function buildPasswordPolicyRulePayload(existingRule, ruleName) {
  return {
    ...(existingRule?.id ? { id: existingRule.id } : {}),
    type: 'PASSWORD',
    name: existingRule?.name ?? ruleName,
    status: 'ACTIVE',
    priority: existingRule?.priority ?? 1,
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
    actions: {
      passwordChange: {
        access: 'ALLOW',
      },
      selfServicePasswordReset: {
        access: 'ALLOW',
        requirement: {
          primary: {
            methods: telephonyEnabled ? ['sms'] : ['email'],
          },
          stepUp: {
            required: false,
          },
          accessControl: 'AUTH_POLICY',
        },
      },
      selfServiceUnlock: {
        access: 'ALLOW',
      },
    },
    system: false,
  };
}

function buildAccessPolicyPayload({ policyName, environmentName }) {
  return {
    type: 'ACCESS_POLICY',
    status: 'ACTIVE',
    name: policyName,
    description: `App sign-in policy for ACME LOS web and mobile apps (${environmentName}).`,
    conditions: null,
  };
}

function buildHighRiskAccessRulePayload(existingRule) {
  return {
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
        verificationMethod: buildPasswordFirstVerificationMethod('2FA', 'PT2H'),
        keepMeSignedIn: {
          postAuth: 'NOT_ALLOWED',
        },
      },
    },
  };
}

function buildStandardAccessRulePayload(existingRule) {
  return {
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
  };
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
  const currentBaseProperties =
    currentSchema?.definitions?.base?.properties ?? {};
  const nextProperties = { ...currentProperties };
  const basePropertyUpdates = {};
  const changedAttributes = [];
  const changedBaseAttributes = [];
  const existingBaseAttributes = [];

  for (const [key, definition] of Object.entries(attributeDefinitions)) {
    const existingBaseDefinition = currentBaseProperties[key];
    if (existingBaseDefinition && definition.useBaseWhenPresent !== false) {
      existingBaseAttributes.push(key);
      const expectedBaseDefinition =
        buildExpectedBaseProfileAttributeDefinition(
          existingBaseDefinition,
          definition,
        );

      if (
        !baseProfileAttributeMatches(
          existingBaseDefinition,
          expectedBaseDefinition,
        )
      ) {
        basePropertyUpdates[key] = expectedBaseDefinition;
        changedBaseAttributes.push(key);
      }

      continue;
    }

    const existingDefinition = currentProperties[key];
    const expectedDefinition =
      buildExpectedProfileAttributeDefinition(definition);

    nextProperties[key] = expectedDefinition;

    if (!profileAttributeMatches(existingDefinition, expectedDefinition)) {
      changedAttributes.push(key);
    }
  }

  if (changedAttributes.length === 0 && changedBaseAttributes.length === 0) {
    return {
      mode: 'existing',
      schema: currentSchema,
      changedAttributes: [],
      changedBaseAttributes: [],
      existingBaseAttributes,
    };
  }

  const schemaDefinitions = {};

  if (changedAttributes.length > 0) {
    schemaDefinitions.custom = {
      id: '#custom',
      type: 'object',
      properties: nextProperties,
    };
  }

  if (changedBaseAttributes.length > 0) {
    schemaDefinitions.base = {
      id: '#base',
      type: 'object',
      properties: basePropertyUpdates,
    };
  }

  const updatedSchema = await updateDefaultUserSchema({
    definitions: schemaDefinitions,
  });

  return {
    mode: 'updated',
    schema: updatedSchema,
    changedAttributes,
    changedBaseAttributes,
    existingBaseAttributes,
  };
}

function buildSelfProfileAttributePermissions(action) {
  return [
    {
      principal: 'SELF',
      action,
    },
  ];
}

function buildExpectedProfileAttributeDefinition(definition) {
  const enumValues = Array.isArray(definition.enumValues)
    ? definition.enumValues
    : [];

  return {
    title: definition.title,
    description: definition.description,
    type: definition.type ?? 'string',
    required: Boolean(definition.required),
    minLength: definition.minLength ?? 1,
    maxLength: definition.maxLength ?? 255,
    permissions: buildSelfProfileAttributePermissions(
      definition.selfPermission ?? 'READ_ONLY',
    ),
    master: {
      type: 'PROFILE_MASTER',
    },
    scope: definition.scope ?? 'NONE',
    mutability: definition.mutability ?? 'READ_WRITE',
    ...(enumValues.length > 0
      ? {
          enum: enumValues.map((option) => option.value),
          oneOf: enumValues.map((option) => ({
            const: option.value,
            title: option.label,
          })),
        }
      : {}),
  };
}

function buildExpectedBaseProfileAttributeDefinition(
  existingDefinition,
  definition,
) {
  const enumValues = Array.isArray(definition.enumValues)
    ? definition.enumValues
    : [];

  return {
    ...existingDefinition,
    ...(definition.title ? { title: definition.title } : {}),
    ...(definition.description ? { description: definition.description } : {}),
    ...(typeof definition.minLength === 'number'
      ? { minLength: definition.minLength }
      : {}),
    ...(typeof definition.maxLength === 'number'
      ? { maxLength: definition.maxLength }
      : {}),
    ...(definition.selfPermission
      ? {
          permissions: buildSelfProfileAttributePermissions(
            definition.selfPermission,
          ),
        }
      : {}),
    ...(enumValues.length > 0
      ? {
          enum: enumValues.map((option) => option.value),
          oneOf: enumValues.map((option) => ({
            const: option.value,
            title: option.label,
          })),
        }
      : {}),
  };
}

function baseProfileAttributeMatches(existingDefinition, expectedDefinition) {
  return (
    existingDefinition?.title === expectedDefinition.title &&
    existingDefinition?.description === expectedDefinition.description &&
    existingDefinition?.minLength === expectedDefinition.minLength &&
    existingDefinition?.maxLength === expectedDefinition.maxLength &&
    JSON.stringify(normalizeProfileAttributePermissions(existingDefinition)) ===
      JSON.stringify(
        normalizeProfileAttributePermissions(expectedDefinition),
      ) &&
    JSON.stringify(existingDefinition?.enum ?? []) ===
      JSON.stringify(expectedDefinition.enum ?? []) &&
    JSON.stringify(existingDefinition?.oneOf ?? []) ===
      JSON.stringify(expectedDefinition.oneOf ?? [])
  );
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
  const existingPermissions =
    normalizeProfileAttributePermissions(existingDefinition);
  const expectedPermissions =
    normalizeProfileAttributePermissions(expectedDefinition);

  return (
    existingDefinition?.title === expectedDefinition.title &&
    existingDefinition?.description === expectedDefinition.description &&
    existingDefinition?.type === expectedDefinition.type &&
    Boolean(existingDefinition?.required) ===
      Boolean(expectedDefinition.required) &&
    existingDefinition?.minLength === expectedDefinition.minLength &&
    existingDefinition?.maxLength === expectedDefinition.maxLength &&
    existingDefinition?.scope === expectedDefinition.scope &&
    existingDefinition?.mutability === expectedDefinition.mutability &&
    existingDefinition?.master?.type === expectedDefinition.master?.type &&
    JSON.stringify(existingPermissions) ===
      JSON.stringify(expectedPermissions) &&
    JSON.stringify(existingDefinition?.enum ?? []) ===
      JSON.stringify(expectedDefinition.enum ?? []) &&
    JSON.stringify(existingDefinition?.oneOf ?? []) ===
      JSON.stringify(expectedDefinition.oneOf ?? [])
  );
}

function normalizeProfileAttributePermissions(definition) {
  const permissions = definition?.permissions;

  if (Array.isArray(permissions)) {
    return permissions.map((permission) => ({
      principal: permission?.principal,
      action: permission?.action,
    }));
  }

  if (permissions && typeof permissions === 'object') {
    return Object.entries(permissions).map(([principal, action]) => ({
      principal,
      action,
    }));
  }

  return [];
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
const signInStartUrl = buildHostedSignInStartUrl(deployedWebBaseUrl);
const hostedExperience = environment.okta?.hostedExperience ?? {};
const telephony = environment.okta?.telephony ?? {};
const userPrune = environment.okta?.userPrune ?? {};
const telephonyEnabled = telephony.enabled === true;
const signInWidgetGeneration = resolveSignInWidgetGeneration(
  hostedExperience.signInWidgetGeneration,
);
const signInWidgetVersion = resolveSignInWidgetVersion(
  hostedExperience.signInWidgetVersion,
);
const mapPrimaryEmailToLogin =
  hostedExperience.mapPrimaryEmailToLogin !== false;
const customerSessionMaxLifetimeDays =
  optionalPositiveInteger(hostedExperience.customerSessionMaxLifetimeDays) ??
  60;
const customerSessionMaxLifetimeMinutes =
  customerSessionMaxLifetimeDays * 24 * 60;
const telephonyHookPath =
  optionalString(telephony.hookPath) ?? '/api/hooks/okta/telephony';
const telephonyHookUri = toAbsoluteUrl(deployedWebBaseUrl, telephonyHookPath);
const telephonyHookAuthorization =
  telephonyEnabled && !dryRun
    ? requiredString(
        process.env.ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION,
        'ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION',
      )
    : '';
const fundingStepUpMethod = resolveFundingStepUpMethod(
  hostedExperience.fundingStepUpMethod,
);
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
const requiresSecurityQuestionAuthenticator = Boolean(
  hostedExperience.registrationRequiresSecurityQuestion,
);
const requiresPhoneAuthenticator = Boolean(
  telephonyEnabled && hostedExperience.registrationRequiresPhoneVerification,
);

if (fundingStepUpMethod === 'sms' && !telephonyEnabled) {
  throw new Error(
    'Set okta.telephony.enabled before using SMS as the funding step-up method.',
  );
}

const accountSecurityPolicyIntent = {
  identityKeys: {
    immutableOktaUserIdClaim: 'sub',
    mutableContactClaims: ['email'],
    backendBusinessClaims: ['customer_id', 'lead_id'],
  },
  orgLevelSettings: [
    {
      setting: 'Map primary email to login attribute',
      desiredState: mapPrimaryEmailToLogin ? 'Enabled' : 'Not enabled',
      adminPath: 'Security > General > Organization',
      scope: 'Okta org',
      automationStatus: 'manual-public-api-not-exposed',
      reason:
        'Okta public Org General Settings APIs do not expose this lifecycle setting. Bootstrap records the desired state and verifies customer users separately.',
      impact:
        'When enabled, new self-service registration users get profile.login from profile.email. Existing users are not rewritten unless their primary email changes or an admin/API user update changes login explicitly.',
    },
  ],
  registration: {
    loginIdentifier: 'email',
    mapPrimaryEmailToLogin,
    hostedProfileAttributes: registrationProfileAttributes,
    hostedStateInput:
      'Missouri/Texas state enum rendered as a select control from the ACME-owned acmeState profile attribute',
    hostedFlowShape:
      'Okta-hosted registration collects profile fields in the profile-enrollment step. Password is modeled as Okta password authenticator enrollment, not as a profile field; Okta renders password requirements and any confirm-password behavior according to hosted widget/org behavior.',
    profileEnrollmentAuthenticatorTypes:
      registrationEnrollmentAuthenticatorTypes,
    requiredAuthenticators: [
      'okta_password',
      ...(requiresEmailAuthenticator ? ['okta_email'] : []),
      ...(requiresSecurityQuestionAuthenticator ? ['security_question'] : []),
    ],
    optionalAuthenticators: [
      ...(!requiresEmailAuthenticator ? ['okta_email'] : []),
      ...(telephonyEnabled && !requiresPhoneAuthenticator
        ? ['phone_number']
        : []),
    ],
  },
  oktaHostedAccountManagement: [
    {
      action: 'forgot_email',
      requiredProofs: ['phone_sms_otp', 'security_question_challenge'],
      postCondition: 'fresh_acme_sign_in',
      backendSync:
        'Treat the recovered Okta email claim as the source of truth only after a fresh ACME sign-in.',
    },
    {
      action: 'change_email',
      requiredProofs: ['phone_sms_otp', 'security_question_challenge'],
      postCondition:
        'sign_out_then_fresh_acme_sign_in_with_new_email_and_email_otp',
      backendSync:
        'After a fresh ACME sign-in with the new email and email OTP, sync the backend email from the current Okta email claim when the Okta subject is unchanged.',
    },
    {
      action: 'forgot_password',
      requiredProofs: ['security_question_challenge', 'phone_sms_otp'],
      postCondition: 'sign_out_then_fresh_acme_sign_in_with_new_password',
      backendSync:
        'Do not sync or store password material. Log only non-sensitive password-change metadata if an Okta event hook is enabled.',
    },
    {
      action: 'change_password',
      requiredProofs: [
        'current_password',
        'phone_sms_otp',
        'security_question_challenge',
      ],
      postCondition: 'sign_out_then_fresh_acme_sign_in_with_new_password',
      backendSync:
        'Do not sync or store password material. Log only non-sensitive password-change metadata if an Okta event hook is enabled.',
    },
    {
      action: 'lost_phone_or_sms_factor_replacement',
      requiredProofs: ['okta_email_otp', 'security_question_challenge'],
      postCondition:
        'replace_phone_then_fresh_acme_sign_in_with_new_phone_sms_otp',
      backendSync:
        'After replacing the phone/SMS factor, require a fresh ACME sign-in with the unchanged email and the new phone/SMS OTP before syncing verified phone metadata from a trusted Okta profile claim, Management API lookup, or event hook.',
    },
    {
      action: 'change_phone_or_sms_factor',
      requiredProofs: ['okta_email_otp', 'security_question_challenge'],
      postCondition: 'sign_out_then_fresh_acme_sign_in_with_new_phone_sms_otp',
      backendSync:
        'After a fresh ACME sign-in with the unchanged email and the new phone/SMS OTP, sync verified phone metadata only when Okta exposes it through a profile claim, Management API lookup, or event hook.',
    },
  ],
  oktaOnlySecrets: [
    'password',
    'security_question_answer',
    'security_question_hint',
    'otp_codes',
  ],
  userPrune: {
    enabled: userPrune.enabled === true,
    action: optionalString(userPrune.action) ?? 'deactivate',
    keepLogins: optionalStringArray(userPrune.keepLogins),
    keepProfileContains: optionalStringArray(userPrune.keepProfileContains),
    destructiveGuard:
      'Use npm run okta:prune-users -- <env> --dry-run first, then --confirm-deactivate after reviewing the exact retained and candidate users.',
  },
};

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

const customerGroupName = `acme-los-customers-${environment.environment}`;
const profileEnrollmentPolicyName = `ACME LOS Registration (${environment.environment})`;
const mfaEnrollmentPolicyName = `ACME LOS Authenticator Enrollment (${environment.environment})`;
const sessionPolicyName = `ACME LOS Global Session (${environment.environment})`;
const passwordPolicyName = `ACME LOS Password Policy (${environment.environment})`;
const accessPolicyName = `ACME LOS App Access (${environment.environment})`;
const telephonyInlineHookName = `ACME LOS ACS SMS (${environment.environment})`;
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
const expectedTelephonyInlineHook = {
  name: telephonyInlineHookName,
  uri: telephonyHookUri,
  payload: {
    name: telephonyInlineHookName,
    type: 'com.okta.telephony.provider',
    version: '1.0.0',
    channel: {
      type: 'HTTP',
      version: '1.0.0',
      config: {
        uri: telephonyHookUri,
        method: 'POST',
        authScheme: {
          type: 'HEADER',
          key: 'Authorization',
          value: telephonyHookAuthorization,
        },
      },
    },
  },
};

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

const oktaPolicyPlan = buildOktaPolicyPlan({
  environmentName,
  hostedExperience,
  telephonyEnabled,
  authorizationServerPolicyName,
  authorizationServerRuleName,
  profileEnrollmentPolicyName,
  mfaEnrollmentPolicyName,
  sessionPolicyName,
  passwordPolicyName,
  accessPolicyName,
  customerGroupName,
  webAppLabel: expectedWebApp.label,
  mobileAppLabel: expectedMobileApp.label,
});
const expectedAccountManagementPolicyRules =
  buildAccountManagementPolicyRuleDefinitions({
    environmentName,
    customerGroupId: `<resolved group id for ${customerGroupName}>`,
    customerGroupName,
    telephonyEnabled,
  });
const sessionAndAdaptivePolicyIntent = {
  session: {
    policyName: sessionPolicyName,
    scope: customerGroupName,
    maxSessionIdleMinutes: 120,
    maxSessionLifetimeDays: customerSessionMaxLifetimeDays,
    maxSessionLifetimeMinutes: customerSessionMaxLifetimeMinutes,
    keepMeSignedIn: Boolean(hostedExperience.keepMeSignedIn),
    rememberDeviceByDefault: Boolean(hostedExperience.rememberUser),
  },
  appSignIn: {
    policyName: accessPolicyName,
    scope: [expectedWebApp.label, expectedMobileApp.label],
    standardRule:
      'Password-first app sign-in. Keep-me-signed-in is allowed only when the environment manifest enables it.',
    highRiskRule: hostedExperience.adaptiveMfaOnSignIn
      ? 'Okta risk score HIGH requires password-first 2FA with keep-me-signed-in disabled for that authentication event.'
      : 'Disabled by hostedExperience.adaptiveMfaOnSignIn=false.',
    signInSecurityQuestion:
      'Security-question challenge/hint is not required during app sign-in; it is reserved for recovery and sensitive account-management changes.',
    deviceRiskBoundary:
      'New-device and anomalous-device signals are Okta risk inputs when the org supports them. Device assurance and device signal collection are org-level Okta features and are not currently provisioned by this bootstrap.',
  },
};

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
        widgetVersion: signInWidgetVersion,
        widgetCustomizations: {
          widgetGeneration: signInWidgetGeneration,
        },
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
      passwordPolicyName,
      accessPolicyName,
    },
    authorizationServerScopes: customerMyAccountOauthScopes.map(
      buildAuthorizationServerScopePayload,
    ),
    policyPlan: oktaPolicyPlan,
    orgLevelSettingsIntent: accountSecurityPolicyIntent.orgLevelSettings,
    accountManagementPolicyRules: summarizeAccountManagementPolicyRules(
      expectedAccountManagementPolicyRules,
    ),
    accountSecurityPolicyIntent,
    sessionAndAdaptivePolicyIntent,
    telephony: {
      enabled: telephonyEnabled,
      hookName: expectedTelephonyInlineHook.name,
      hookUri: expectedTelephonyInlineHook.uri,
      authScheme: telephonyEnabled ? 'HEADER Authorization' : 'disabled',
      phoneAuthenticatorEnrollment: telephonyEnabled
        ? requiresPhoneAuthenticator
          ? 'REQUIRED'
          : 'OPTIONAL'
        : 'disabled',
    },
    authenticatorEnrollment: {
      password: 'REQUIRED',
      email: requiresEmailAuthenticator ? 'REQUIRED' : 'OPTIONAL',
      securityQuestion: requiresSecurityQuestionAuthenticator
        ? 'REQUIRED'
        : 'OPTIONAL',
      phone: telephonyEnabled
        ? requiresPhoneAuthenticator
          ? 'REQUIRED'
          : 'OPTIONAL'
        : 'disabled',
    },
    registrationProfileAttributes,
    registrationEnrollmentAuthenticatorTypes,
    registrationProfileUiSchema: buildProfileEnrollmentUiSchema().uiSchema,
    managedUserProfileAttributes: [
      'leadId',
      'customerId',
      'mobilePhone',
      'acmeState',
    ],
    customProfileAttributes: ['leadId', 'customerId', 'acmeState'],
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
  printOktaPolicyPlan(oktaPolicyPlan);
  console.log('- Okta org-level settings intent:');
  for (const settingIntent of accountSecurityPolicyIntent.orgLevelSettings) {
    console.log(
      `  - ${settingIntent.setting}: ${settingIntent.desiredState} (${settingIntent.automationStatus}; ${settingIntent.adminPath})`,
    );
  }
  printAccountManagementPolicyRules(expectedAccountManagementPolicyRules);
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
  const customizedSignInPageContent =
    buildHostedSignInPageContent(hostedBranding);
  const persistedSignInPage = await putAndVerifyCustomizedSignInPage(
    customerBrand.id,
    {
      pageContent: customizedSignInPageContent,
      contentSecurityPolicySetting:
        defaultSignInPage.contentSecurityPolicySetting ?? { mode: 'enforced' },
      widgetVersion: signInWidgetVersion,
      widgetCustomizations: {
        ...(defaultSignInPage.widgetCustomizations ?? {}),
        widgetGeneration: signInWidgetGeneration,
      },
    },
  );
  results.customizedSignInPage = {
    mode: 'applied',
    presentation: 'okta-gen3-shell',
    widgetVersion: persistedSignInPage.widgetVersion ?? 'unknown',
    widgetGeneration:
      persistedSignInPage.widgetCustomizations?.widgetGeneration ?? 'unknown',
    pageContentLength: persistedSignInPage.pageContent?.length ?? 0,
  };

  const defaultErrorPage = await getDefaultErrorPage(customerBrand.id);
  const customizedErrorPageContent =
    buildHostedErrorPageContent(hostedBranding);
  const persistedErrorPage = await putAndVerifyCustomizedErrorPage(
    customerBrand.id,
    {
      pageContent: customizedErrorPageContent,
      contentSecurityPolicySetting:
        defaultErrorPage.contentSecurityPolicySetting ?? { mode: 'enforced' },
    },
  );
  results.customizedErrorPage = {
    mode: 'applied',
    pageContentLength: persistedErrorPage.pageContent?.length ?? 0,
  };
} else {
  results.customizedSignInPage = { mode: 'pending-custom-domain' };
  results.customizedErrorPage = { mode: 'pending-custom-domain' };
  warnings.push(
    'Hosted sign-in and error page HTML customization is deferred until a custom domain is mapped to the customer brand. Theme, logo, and favicon are already applied to the customer brand.',
  );
}

const authenticators = await listAuthenticators();
const updatedEmailAuthenticator = await ensureAuthenticator({
  authenticators,
  key: 'okta_email',
  name: 'Email',
  type: 'email',
});
results.emailAuthenticator = {
  id: updatedEmailAuthenticator.id,
  allowedFor: updatedEmailAuthenticator.settings?.allowedFor ?? 'unknown',
};

const updatedSecurityQuestionAuthenticator = await ensureAuthenticator({
  authenticators,
  key: 'security_question',
  name: 'Security Question',
  type: 'security_question',
});
results.securityQuestionAuthenticator = {
  id: updatedSecurityQuestionAuthenticator.id,
  allowedFor:
    updatedSecurityQuestionAuthenticator.settings?.allowedFor ?? 'unknown',
  enrollment: requiresSecurityQuestionAuthenticator ? 'REQUIRED' : 'OPTIONAL',
};

if (telephonyEnabled) {
  const telephonyInlineHookResult = await ensureTelephonyInlineHook(
    expectedTelephonyInlineHook,
  );
  results.telephonyInlineHook = {
    mode: telephonyInlineHookResult.mode,
    id: telephonyInlineHookResult.hook.id,
    uri: telephonyHookUri,
  };

  const updatedPhoneAuthenticator = await ensureAuthenticator({
    authenticators,
    key: 'phone_number',
    name: 'Phone',
    type: 'phone',
  });
  const phoneAuthenticatorMethods = await listAuthenticatorMethods(
    updatedPhoneAuthenticator.id,
  );
  const smsMethod =
    phoneAuthenticatorMethods.find((method) => method.type === 'sms') ?? null;
  const voiceMethod =
    phoneAuthenticatorMethods.find((method) => method.type === 'voice') ?? null;

  if (!smsMethod) {
    throw new Error('Unable to find the Okta phone SMS authenticator method.');
  }

  if (smsMethod.status !== 'ACTIVE') {
    await activateAuthenticatorMethod(updatedPhoneAuthenticator.id, 'sms');
  }

  if (voiceMethod?.status === 'ACTIVE') {
    await deactivateAuthenticatorMethod(updatedPhoneAuthenticator.id, 'voice');
  }

  results.phoneAuthenticator = {
    id: updatedPhoneAuthenticator.id,
    allowedFor: updatedPhoneAuthenticator.settings?.allowedFor ?? 'unknown',
    sms: 'ACTIVE',
    voice: 'INACTIVE',
  };
  warnings.push(
    'SMS MFA is enabled as a possession factor and recovery option. Keep stronger phishing-resistant authenticators available for sensitive production actions.',
  );
} else {
  results.telephonyInlineHook = await disableManagedTelephonyInlineHook(
    expectedTelephonyInlineHook.name,
  );
  const phoneAuthenticator =
    authenticators.find(
      (authenticator) => authenticator.key === 'phone_number',
    ) ?? null;

  if (
    results.telephonyInlineHook.id &&
    phoneAuthenticator?.status === 'ACTIVE'
  ) {
    await deactivateAuthenticator(phoneAuthenticator.id);
    results.phoneAuthenticator = {
      mode: 'disabled',
      id: phoneAuthenticator.id,
    };
  } else {
    results.phoneAuthenticator = {
      mode: phoneAuthenticator?.status ?? 'not-found',
      id: phoneAuthenticator?.id,
    };
  }
}

const everyoneGroup = await findGroupByName('Everyone');
const everyoneGroupId = everyoneGroup?.id ?? null;

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
const customerGroupId = customerGroup.id;

const passwordPolicyResult = await ensurePolicy(
  'PASSWORD',
  passwordPolicyName,
  () =>
    buildPasswordPolicyPayload({
      policyName: passwordPolicyName,
      environmentName: environment.environment,
      customerGroupId,
    }),
);
results.passwordPolicy = {
  mode: passwordPolicyResult.mode,
  id: passwordPolicyResult.policy.id,
};

const passwordPolicyRuleName = `ACME LOS Password Recovery (${environment.environment})`;
const passwordPolicyRuleResult = await ensureRule(
  passwordPolicyResult.policy.id,
  passwordPolicyRuleName,
  (existingRule) =>
    buildPasswordPolicyRulePayload(existingRule, passwordPolicyRuleName),
);
results.passwordPolicyRule = {
  mode: passwordPolicyRuleResult.mode,
  id: passwordPolicyRuleResult.rule.id,
  actions: passwordPolicyRuleResult.rule.actions,
};

results.authorizationServerScopes = [];
for (const scopeName of customerMyAccountOauthScopes) {
  const scopeResult = await ensureAuthorizationServerScope(
    authorizationServerId,
    scopeName,
  );

  results.authorizationServerScopes.push({
    mode: scopeResult.mode,
    id: scopeResult.scope.id,
    name: scopeResult.scope.name,
  });
}

const authorizationServerPolicyResult = await ensureAuthorizationServerPolicy(
  authorizationServerId,
  authorizationServerPolicyName,
  () =>
    buildAuthorizationServerPolicyPayload({
      policyName: authorizationServerPolicyName,
      environmentName: environment.environment,
      clientIds: [
        results[expectedWebApp.label].clientId,
        results[expectedMobileApp.label].clientId,
      ],
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
  (existingRule) =>
    buildAuthorizationServerRulePayload({
      existingRule,
      ruleName: authorizationServerRuleName,
      groupId: customerGroupId,
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
  mobilePhone: {
    title: 'Phone number',
    description:
      'Customer phone number captured during Okta-hosted registration.',
    minLength: 1,
    maxLength: 32,
    selfPermission: 'READ_WRITE',
  },
  acmeState: {
    title: 'State',
    description:
      'Customer supported state captured during Okta-hosted registration.',
    minLength: 2,
    maxLength: 2,
    selfPermission: 'READ_WRITE',
    enumValues: supportedStateOptions,
  },
});
results.customProfileAttributes = {
  mode: customProfileAttributesResult.mode,
  changedAttributes: customProfileAttributesResult.changedAttributes,
  changedBaseAttributes: customProfileAttributesResult.changedBaseAttributes,
  existingBaseAttributes: customProfileAttributesResult.existingBaseAttributes,
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
  (existingPolicy) =>
    buildProfileEnrollmentPolicyPayload({
      existingPolicy,
      policyName: profileEnrollmentPolicyName,
      environmentName: environment.environment,
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
if (!profileEnrollmentRule) {
  throw new Error(
    `Unable to find a profile enrollment rule for ${profileEnrollmentPolicyName}. Registration cannot be safely scoped to ${customerGroupName}.`,
  );
}

const profileEnrollmentUiSchemaId = optionalString(
  profileEnrollmentRule.actions?.profileEnrollment?.uiSchemaId,
);
if (profileEnrollmentUiSchemaId) {
  const profileEnrollmentUiSchema = await getUiSchema(
    profileEnrollmentUiSchemaId,
  );
  const uiSchemaAttributes = readUiSchemaAttributeNames(
    profileEnrollmentUiSchema.uiSchema,
  );

  if (profileEnrollmentUiSchemaMatches(profileEnrollmentUiSchema.uiSchema)) {
    results.profileEnrollmentUiSchema = {
      mode: 'existing',
      id: profileEnrollmentUiSchema.id,
      profileAttributes: uiSchemaAttributes,
    };
  } else {
    const updatedProfileEnrollmentUiSchema = await updateUiSchema(
      profileEnrollmentUiSchemaId,
      buildProfileEnrollmentUiSchema(profileEnrollmentUiSchema.uiSchema),
    );

    results.profileEnrollmentUiSchema = {
      mode: 'updated',
      id: updatedProfileEnrollmentUiSchema.id,
      profileAttributes: readUiSchemaAttributeNames(
        updatedProfileEnrollmentUiSchema.uiSchema,
      ),
    };
  }
} else {
  results.profileEnrollmentUiSchema = {
    mode: 'not-found',
    id: '',
    profileAttributes: [],
  };
  warnings.push(
    `Profile-enrollment rule "${profileEnrollmentRule.name}" did not expose a uiSchemaId, so bootstrap could not manage hosted registration field ordering through the UI Schema API.`,
  );
}

try {
  const existingTargetGroupIds = readProfileEnrollmentTargetGroupIds(
    profileEnrollmentRule,
  );
  const profileAttributesMatch = profileEnrollmentManagedAttributesMatch(
    profileEnrollmentRule,
  );
  const enrollmentAuthenticatorTypesMatch =
    profileEnrollmentAuthenticatorTypesMatch(profileEnrollmentRule);

  if (
    existingTargetGroupIds.length === 1 &&
    existingTargetGroupIds.includes(customerGroupId) &&
    profileAttributesMatch &&
    enrollmentAuthenticatorTypesMatch
  ) {
    results.profileEnrollmentRule = {
      mode: 'existing',
      id: profileEnrollmentRule.id,
      targetGroupIds: existingTargetGroupIds,
      profileAttributes: readProfileEnrollmentAttributeNames(
        profileEnrollmentRule,
      ),
      enrollAuthenticatorTypes: readProfileEnrollmentAuthenticatorTypes(
        profileEnrollmentRule,
      ),
    };
  } else {
    const updatedProfileEnrollmentRule = await updatePolicyRule(
      profileEnrollmentPolicyResult.policy.id,
      profileEnrollmentRule.id,
      buildProfileEnrollmentRulePayload(profileEnrollmentRule, customerGroupId),
    );
    const targetGroupIds = readProfileEnrollmentTargetGroupIds(
      updatedProfileEnrollmentRule,
    );

    if (!targetGroupIds.includes(customerGroupId)) {
      throw new Error(
        `Okta profile-enrollment registration rule "${updatedProfileEnrollmentRule.name}" did not target ${customerGroupName} (${customerGroupId}) after update.`,
      );
    }

    results.profileEnrollmentRule = {
      mode: 'updated',
      id: updatedProfileEnrollmentRule.id,
      targetGroupIds,
      profileAttributes: readProfileEnrollmentAttributeNames(
        updatedProfileEnrollmentRule,
      ),
      enrollAuthenticatorTypes: readProfileEnrollmentAuthenticatorTypes(
        updatedProfileEnrollmentRule,
      ),
    };
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (isReadOnlyConditionsError(error)) {
    const actualTargetGroupIds = readProfileEnrollmentTargetGroupIds(
      profileEnrollmentRule,
    );
    const actualProfileAttributes = readProfileEnrollmentAttributeNames(
      profileEnrollmentRule,
    );
    const targetProfileAttributes = registrationProfileAttributes.map(
      (attribute) => attribute.name,
    );
    const missingProfileAttributes = targetProfileAttributes.filter(
      (attributeName) => !actualProfileAttributes.includes(attributeName),
    );
    const actualEnrollmentAuthenticatorTypes =
      readProfileEnrollmentAuthenticatorTypes(profileEnrollmentRule);
    const missingEnrollmentAuthenticatorTypes =
      registrationEnrollmentAuthenticatorTypes.filter(
        (authenticatorType) =>
          !actualEnrollmentAuthenticatorTypes.includes(authenticatorType),
      );
    const uiSchemaProfileAttributes =
      results.profileEnrollmentUiSchema?.profileAttributes ?? [];

    results.profileEnrollmentRule = {
      mode: 'manual-required',
      id: profileEnrollmentRule.id,
      actualTargetGroupIds,
      actualProfileAttributes,
      actualEnrollmentAuthenticatorTypes,
      targetGroupIds: [customerGroupId],
      targetProfileAttributes,
      targetEnrollmentAuthenticatorTypes:
        registrationEnrollmentAuthenticatorTypes,
      missingProfileAttributes,
      missingEnrollmentAuthenticatorTypes,
      reason: 'okta-read-only-rule-conditions',
    };
    throw new Error(
      `${describeProfileEnrollmentManualGate({
        customerGroupId,
        customerGroupName,
        missingEnrollmentAuthenticatorTypes,
        missingProfileAttributes,
        profileEnrollmentPolicyName,
        ruleName: profileEnrollmentRule.name,
      })} Actual rule fields: ${actualProfileAttributes.join(', ') || 'none'}. Actual UI schema fields: ${uiSchemaProfileAttributes.join(', ') || 'none'}. Target fields: ${targetProfileAttributes.join(', ')}. Actual registration enrollment types: ${actualEnrollmentAuthenticatorTypes.join(', ') || 'none'}. Target registration enrollment types: ${registrationEnrollmentAuthenticatorTypes.join(', ')}. Okta error: ${message}`,
    );
  } else {
    throw new Error(
      `Unable to scope ${profileEnrollmentPolicyName} registration to ${customerGroupName}. Update the profile enrollment rule target group manually, then rerun bootstrap. ${message}`,
    );
  }
}

const accountManagementPolicyRules =
  buildAccountManagementPolicyRuleDefinitions({
    environmentName,
    customerGroupId,
    customerGroupName,
    telephonyEnabled,
  });
const accessPolicies = await listPolicies('ACCESS_POLICY');
const accountManagementPolicy = findAccountManagementPolicy(accessPolicies);
results.accountManagementPolicy = accountManagementPolicy
  ? {
      mode: 'existing',
      id: accountManagementPolicy.id,
      name: accountManagementPolicy.name,
    }
  : {
      mode: 'not-found',
      resourceType: 'END_USER_ACCOUNT_MANAGEMENT',
    };
results.accountManagementPolicyRules = [];

if (!accountManagementPolicy) {
  throw new Error(
    'Okta account-management policy was not found in ACCESS_POLICY results with resourceType END_USER_ACCOUNT_MANAGEMENT. Confirm Identity Engine account-management policy is enabled before relying on email, phone, or password lifecycle automation.',
  );
}

for (const ruleDefinition of accountManagementPolicyRules) {
  const ruleResult = await ensureRule(
    accountManagementPolicy.id,
    ruleDefinition.name,
    ruleDefinition.payload,
  );
  results.accountManagementPolicyRules.push({
    mode: ruleResult.mode,
    id: ruleResult.rule.id,
    name: ruleDefinition.name,
    scenarioIds: ruleDefinition.scenarioIds,
    expectedProofs: ruleDefinition.expectedProofs,
  });
}

const mfaPolicyResult = await ensurePolicy(
  'MFA_ENROLL',
  mfaEnrollmentPolicyName,
  () =>
    buildMfaEnrollmentPolicyPayload({
      policyName: mfaEnrollmentPolicyName,
      environmentName: environment.environment,
      customerGroupId,
    }),
);
results.mfaEnrollmentPolicy = {
  mode: mfaPolicyResult.mode,
  id: mfaPolicyResult.policy.id,
};

const mfaRuleResult = await ensureRule(
  mfaPolicyResult.policy.id,
  'ACME LOS Enrollment',
  buildMfaEnrollmentRulePayload,
);
results.mfaEnrollmentRule = {
  mode: mfaRuleResult.mode,
  id: mfaRuleResult.rule.id,
};

const sessionPolicyResult = await ensurePolicy(
  'OKTA_SIGN_ON',
  sessionPolicyName,
  () =>
    buildSessionPolicyPayload({
      policyName: sessionPolicyName,
      environmentName: environment.environment,
      customerGroupId,
    }),
);
results.sessionPolicy = {
  mode: sessionPolicyResult.mode,
  id: sessionPolicyResult.policy.id,
};

const sessionRuleResult = await ensureRule(
  sessionPolicyResult.policy.id,
  'ACME LOS Customer Session',
  buildSessionRulePayload,
);
results.sessionRule = {
  mode: sessionRuleResult.mode,
  id: sessionRuleResult.rule.id,
};

const accessPolicyResult = await ensurePolicy(
  'ACCESS_POLICY',
  accessPolicyName,
  () =>
    buildAccessPolicyPayload({
      policyName: accessPolicyName,
      environmentName: environment.environment,
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
      buildHighRiskAccessRulePayload,
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
  buildStandardAccessRulePayload,
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
  await assignGroupToApplication(appResult.id, customerGroupId);
  if (everyoneGroupId && everyoneGroupId !== customerGroupId) {
    await unassignGroupFromApplication(appResult.id, everyoneGroupId);
  }
}
results.applicationAssignmentGroupId = customerGroupId;

if (hostedExperience.rememberUser) {
  warnings.push(
    "The hosted sign-in page uses the ACME Gen3 shell around native Okta controls, so Okta's built-in remember-user behavior is visible if enabled by the widget/org configuration. Customer session lifetime and remember-device behavior remain controlled by the scoped Okta session and access policies.",
  );
}

if (mapPrimaryEmailToLogin) {
  warnings.push(
    'Verify Okta Admin > Security > General > Organization > Map primary email to login attribute is Enabled. Okta public Org General Settings APIs do not expose this lifecycle switch, so bootstrap records the desired state but cannot safely flip it.',
  );
}

if (hostedExperience.fundingRouteStepUp) {
  warnings.push(
    `Funding step-up remains enforced in application code through acr_values plus max_age=0 on the guarded funding step. Existing Okta SSO alone should not satisfy the configured ${fundingStepUpMethod} OTP step-up factor. Verify this behavior once after publishing the hosted page and policy changes.`,
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
  profileEnrollmentRule: results.profileEnrollmentRule,
  profileEnrollmentUiSchema: results.profileEnrollmentUiSchema,
  passwordPolicyId: results.passwordPolicy.id,
  passwordPolicyRuleId: results.passwordPolicyRule.id,
  mfaEnrollmentPolicyId: results.mfaEnrollmentPolicy.id,
  sessionPolicyId: results.sessionPolicy.id,
  accessPolicyId: results.accessPolicy.id,
  policyPlan: oktaPolicyPlan,
  orgLevelSettingsIntent: accountSecurityPolicyIntent.orgLevelSettings,
  accountManagementPolicy: results.accountManagementPolicy,
  accountManagementPolicyRules: results.accountManagementPolicyRules,
  accountSecurityPolicyIntent,
  sessionAndAdaptivePolicyIntent,
  securityQuestionAuthenticator: results.securityQuestionAuthenticator,
  telephonyInlineHook: results.telephonyInlineHook,
  phoneAuthenticator: results.phoneAuthenticator,
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
  `- Managed user profile attributes (${results.customProfileAttributes.mode}): leadId, customerId, mobilePhone, acmeState`,
);
if (results.customProfileAttributes.changedBaseAttributes.length > 0) {
  console.log(
    `  - Updated base profile attribute permissions: ${results.customProfileAttributes.changedBaseAttributes.join(', ')}`,
  );
}
if (results.customProfileAttributes.existingBaseAttributes.length > 0) {
  console.log(
    `  - Existing Okta base profile attributes reused: ${results.customProfileAttributes.existingBaseAttributes.join(', ')}`,
  );
}
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
  `- Profile enrollment rule (${results.profileEnrollmentRule.mode}): ${results.profileEnrollmentRule.profileAttributes.join(', ')}`,
);
console.log(
  `- Profile enrollment UI schema (${results.profileEnrollmentUiSchema.mode}): ${results.profileEnrollmentUiSchema.profileAttributes.join(', ')}`,
);
console.log(
  `- Password policy (${results.passwordPolicy.mode}): ${results.passwordPolicy.id}`,
);
console.log(
  `- Password recovery rule (${results.passwordPolicyRule.mode}): ${results.passwordPolicyRule.id}`,
);
console.log(
  `- Authorization server policy: ${results.authorizationServerPolicy.id}`,
);
console.log(
  `- Authorization server rule: ${results.authorizationServerRule.id}`,
);
console.log(`- Access policy: ${results.accessPolicy.id}`);
printOktaPolicyPlan(oktaPolicyPlan);
console.log('- Okta org-level settings intent:');
for (const settingIntent of accountSecurityPolicyIntent.orgLevelSettings) {
  console.log(
    `  - ${settingIntent.setting}: ${settingIntent.desiredState} (${settingIntent.automationStatus}; ${settingIntent.adminPath})`,
  );
}
printAccountManagementPolicyRules(accountManagementPolicyRules);
console.log(
  `- Security question authenticator: ${results.securityQuestionAuthenticator.enrollment}`,
);
console.log(`- Telephony inline hook: ${results.telephonyInlineHook.mode}`);
console.log(
  `- Phone authenticator: ${results.phoneAuthenticator.id ? `sms=${results.phoneAuthenticator.sms}, voice=${results.phoneAuthenticator.voice}` : results.phoneAuthenticator.mode}`,
);
if (warnings.length > 0) {
  console.log('- Warnings:');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

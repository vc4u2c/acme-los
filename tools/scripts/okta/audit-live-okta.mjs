import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAccountManagementPolicyRuleDefinitions,
  findAccountManagementPolicy,
} from './account-management-policy.mjs';
import {
  loadOktaPolicyScenarioManifest,
  resolveOktaPolicyPlan,
} from './policy-plan.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const args = process.argv.slice(2);
const environmentName = args[0];

if (!environmentName || environmentName.startsWith('--')) {
  console.error(
    'Usage: node tools/scripts/okta/audit-live-okta.mjs <dev|qa|stg|prod> [--since-days 7] [--max-log-pages 10] [--token-file <path>] [--token-type api|bearer]',
  );
  process.exit(1);
}

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

const sinceDays = Number.parseInt(optionValue('--since-days', '7'), 10);
const maxLogPages = Number.parseInt(optionValue('--max-log-pages', '10'), 10);
const tokenFile = optionValue('--token-file', undefined);
const tokenType = optionValue('--token-type', undefined);

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

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readToken() {
  const bearerToken = process.env.OKTA_MANAGEMENT_ACCESS_TOKEN?.trim();
  if (bearerToken) {
    return { value: bearerToken, scheme: 'Bearer', source: 'env:bearer' };
  }

  const apiToken = process.env.OKTA_API_TOKEN?.trim();
  if (apiToken) {
    return { value: apiToken, scheme: 'SSWS', source: 'env:api' };
  }

  if (tokenFile) {
    const value = fs.readFileSync(tokenFile, 'utf8').trim();
    if (!value) {
      throw new Error(`Token file "${tokenFile}" was empty.`);
    }

    if (tokenType === 'bearer') {
      return { value, scheme: 'Bearer', source: 'file:bearer' };
    }

    return { value, scheme: 'SSWS', source: 'file:api' };
  }

  throw new Error(
    'Set OKTA_MANAGEMENT_ACCESS_TOKEN, OKTA_API_TOKEN, or pass --token-file.',
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
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && value.length > 0)
    : [];
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

function resolveAllowedWebBaseUrls(webConfig) {
  const values = [
    webConfig?.baseUrl,
    webConfig?.deployedBaseUrl,
    ...(Array.isArray(webConfig?.additionalBaseUrls)
      ? webConfig.additionalBaseUrls
      : []),
  ];

  return [...new Set(optionalStringArray(values))];
}

function toAbsoluteUrl(baseUrl, pathname) {
  return new URL(requiredString(pathname, 'path'), baseUrl).toString();
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

function parseLinkHeader(linkHeader) {
  if (!linkHeader) {
    return {};
  }

  return Object.fromEntries(
    linkHeader
      .split(',')
      .map((part) => {
        const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
        return match ? [match[2], match[1]] : null;
      })
      .filter(Boolean),
  );
}

function collectValuesByKey(value, key, collected = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectValuesByKey(item, key, collected);
    }
    return collected;
  }

  if (!value || typeof value !== 'object') {
    return collected;
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key) {
      collected.push(entryValue);
    }
    collectValuesByKey(entryValue, key, collected);
  }

  return collected;
}

function containsValue(value, expected) {
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(item, expected));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsValue(item, expected));
  }

  return value === expected;
}

function includesGroupId(value, groupId) {
  return containsValue(collectValuesByKey(value, 'include'), groupId);
}

function hasOnlyExpectedAppIds(policyOrRule, expectedAppIds) {
  const includeValues = collectValuesByKey(policyOrRule, 'include').flat();
  const appIds = includeValues.filter((value) =>
    expectedAppIds.includes(value),
  );

  return (
    appIds.length > 0 && appIds.every((value) => expectedAppIds.includes(value))
  );
}

function objectLinkId(object, linkName) {
  const href = object?._links?.[linkName]?.href;
  if (typeof href !== 'string') {
    return undefined;
  }

  return href.split('/').filter(Boolean).at(-1);
}

function hasTargetGroupId(rule, groupId) {
  return rule?.actions?.profileEnrollment?.targetGroupIds?.includes(groupId);
}

function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return value;
  }

  const [local, domain] = value.split('@');
  const suffix = local.slice(-1);
  return `${local.slice(0, 1)}***${suffix}@${domain}`;
}

function maskPhone(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\+?(\d{1,3})\d{4,}(\d{4})/g, '+$1******$2');
}

function redactText(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return maskPhone(
    value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) =>
      maskEmail(email),
    ),
  );
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function summarizeRules(rules) {
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    status: rule.status,
    priority: rule.priority,
    conditions: rule.conditions,
    actions: rule.actions,
  }));
}

const token = readToken();
const environment = readJsonFile(environmentPath);
const brandProfile = readJsonFile(brandProfilePath);
const policyScenarioManifest = loadOktaPolicyScenarioManifest(repoRoot);
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const authorizationServerId = resolveAuthorizationServerId(issuer);
const customerGroupName = `acme-los-customers-${environment.environment}`;
const webAppLabel = `ACME LOS Web (${environment.environment})`;
const mobileAppLabel = `ACME LOS Mobile (${environment.environment})`;
const profileEnrollmentPolicyName = `ACME LOS Registration (${environment.environment})`;
const mfaEnrollmentPolicyName = `ACME LOS Authenticator Enrollment (${environment.environment})`;
const sessionPolicyName = `ACME LOS Global Session (${environment.environment})`;
const passwordPolicyName = `ACME LOS Password Policy (${environment.environment})`;
const accessPolicyName = `ACME LOS App Access (${environment.environment})`;
const authorizationServerPolicyName = `ACME LOS Default Authorization (${environment.environment})`;
const authorizationServerRuleName = 'ACME LOS Default Tokens';
const telephonyInlineHookName = `ACME LOS ACS SMS (${environment.environment})`;
const customerBrandName = requiredString(
  brandProfile.customerBrandName,
  'brand.customerBrandName',
);
const expectedSignInWidgetGeneration = resolveSignInWidgetGeneration(
  environment.okta?.hostedExperience?.signInWidgetGeneration,
);
const expectedTelephonyUri = environment.okta?.telephony?.enabled
  ? toAbsoluteUrl(
      requiredString(environment.web?.deployedBaseUrl, 'web.deployedBaseUrl'),
      requiredString(
        environment.okta.telephony.hookPath,
        'okta.telephony.hookPath',
      ),
    )
  : undefined;
const allowedWebBaseUrls = resolveAllowedWebBaseUrls(environment.web);
const expectedWebRedirectUris = allowedWebBaseUrls.map((baseUrl) =>
  toAbsoluteUrl(baseUrl, environment.web?.redirectPath),
);
const expectedMobileRedirectUri = toMobileRedirectUri(
  environment.mobile?.scheme,
  environment.mobile?.redirectPath,
);
const expectedWebLogoutUris = allowedWebBaseUrls.map((baseUrl) =>
  toAbsoluteUrl(baseUrl, environment.web?.postLogoutRedirectPath),
);
const checks = [];
const warnings = [];

function addCheck(status, id, title, details = undefined) {
  checks.push({
    status,
    id,
    title,
    ...(details ? { details: redactText(details) } : {}),
  });
}

async function oktaFetch(inputUrl, options = {}) {
  const response = await fetch(inputUrl, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `${token.scheme} ${token.value}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let details = '';
    try {
      details = JSON.stringify(await response.json());
    } catch {
      details = await response.text();
    }

    throw new Error(
      `${options.method ?? 'GET'} ${inputUrl} failed with ${response.status}: ${details}`,
    );
  }

  if (response.status === 204) {
    return { data: null, link: {} };
  }

  return {
    data: await response.json(),
    link: parseLinkHeader(response.headers.get('link')),
  };
}

async function oktaRequest(pathname, query = undefined) {
  const url = new URL(pathname, oktaApiBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  return (await oktaFetch(url)).data;
}

async function oktaRequestNullable(pathname, query = undefined) {
  try {
    return await oktaRequest(pathname, query);
  } catch (error) {
    if (error instanceof Error && error.message.includes(' 404:')) {
      return null;
    }

    warnings.push(
      redactText(error instanceof Error ? error.message : String(error)),
    );
    return null;
  }
}

async function listAll(pathname, query = undefined, pageLimit = 20) {
  const url = new URL(pathname, oktaApiBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  const items = [];
  let nextUrl = url.toString();
  let pages = 0;
  while (nextUrl && pages < pageLimit) {
    const response = await oktaFetch(nextUrl);
    if (Array.isArray(response.data)) {
      items.push(...response.data);
    } else if (response.data) {
      items.push(response.data);
    }

    nextUrl = response.link.next;
    pages += 1;
  }

  return items;
}

async function findGroupByName(name) {
  const groups = await listAll('/api/v1/groups', { q: name, limit: 100 });
  return groups.find((group) => group.profile?.name === name) ?? null;
}

async function findAppByLabel(label) {
  const apps = await listAll('/api/v1/apps', { q: label, limit: 100 });
  return apps.find((app) => app.label === label) ?? null;
}

async function findPolicyByName(type, name) {
  const policies = await listAll('/api/v1/policies', { type, limit: 200 });
  return policies.find((policy) => policy.name === name) ?? null;
}

async function listPolicyRules(policy) {
  if (!policy?.id) {
    return [];
  }

  return listAll(`/api/v1/policies/${policy.id}/rules`, { limit: 200 });
}

async function listAuthorizationServerPolicies() {
  return listAll(
    `/api/v1/authorizationServers/${authorizationServerId}/policies`,
    {
      limit: 200,
    },
  );
}

async function listAuthorizationServerRules(policyId) {
  return listAll(
    `/api/v1/authorizationServers/${authorizationServerId}/policies/${policyId}/rules`,
    { limit: 200 },
  );
}

async function listAuthorizationServerClaims() {
  return listAll(
    `/api/v1/authorizationServers/${authorizationServerId}/claims`,
    {
      limit: 200,
    },
  );
}

function summarizeApp(app) {
  if (!app) {
    return null;
  }

  const settings = app.settings?.oauthClient ?? {};
  return {
    id: app.id,
    label: app.label,
    status: app.status,
    signOnMode: app.signOnMode,
    redirectUris: settings.redirect_uris ?? [],
    postLogoutRedirectUris: settings.post_logout_redirect_uris ?? [],
    grantTypes: settings.grant_types ?? [],
    responseTypes: settings.response_types ?? [],
    applicationType: settings.application_type,
    accessPolicyId: objectLinkId(app, 'accessPolicy'),
    profileEnrollmentPolicyId: objectLinkId(app, 'profileEnrollment'),
  };
}

function summarizePolicy(policy, rules) {
  if (!policy) {
    return null;
  }

  return {
    id: policy.id,
    name: policy.name,
    type: policy.type,
    status: policy.status,
    priority: policy.priority,
    resourceType: policy._embedded?.resourceType,
    conditions: policy.conditions,
    rules: summarizeRules(rules),
  };
}

function checkObjectExists(object, id, title) {
  addCheck(object ? 'pass' : 'fail', id, title);
}

function checkStatusActive(object, id, title) {
  addCheck(
    object?.status === 'ACTIVE' ? 'pass' : 'fail',
    id,
    title,
    object ? `status=${object.status}` : 'missing',
  );
}

function checkCustomerScoped(object, groupId, id, title) {
  addCheck(
    object && includesGroupId(object, groupId) ? 'pass' : 'fail',
    id,
    title,
    object ? `expected group id ${groupId}` : 'missing',
  );
}

function checkNoEveryoneAppAssignment(assignments, id, title) {
  const hasEveryone = assignments.some(
    (assignment) => assignment.profile?.name === 'Everyone',
  );
  addCheck(hasEveryone ? 'fail' : 'pass', id, title);
}

function summarizeAuthenticator(authenticator, methods = []) {
  if (!authenticator) {
    return null;
  }

  return {
    id: authenticator.id,
    key: authenticator.key,
    name: authenticator.name,
    status: authenticator.status,
    allowedFor: authenticator.settings?.allowedFor,
    methods: methods.map((method) => ({
      type: method.type,
      status: method.status,
    })),
  };
}

function isSmsRelatedEvent(event) {
  const searchable = JSON.stringify({
    eventType: event.eventType,
    displayMessage: event.displayMessage,
    outcome: event.outcome,
    debugContext: event.debugContext,
    target: event.target,
  }).toLowerCase();

  return [
    'sms',
    'telephony',
    'phone',
    'inline_hook',
    'inline hook',
    'factor',
    'mfa',
  ].some((keyword) => searchable.includes(keyword));
}

function summarizeSystemLogEvents(events) {
  const smsRelatedEvents = events.filter(isSmsRelatedEvent);
  const limitExceededEvents = smsRelatedEvents.filter((event) =>
    JSON.stringify(event).toLowerCase().includes('limit'),
  );
  const inlineHookEvents = smsRelatedEvents.filter((event) =>
    JSON.stringify(event).toLowerCase().includes('inline'),
  );
  const providerCounts = countBy(smsRelatedEvents, (event) => {
    const debugData = event.debugContext?.debugData ?? {};
    return (
      debugData.smsProvider ??
      debugData.provider ??
      debugData.telephonyProvider ??
      'not_logged'
    );
  });

  return {
    scannedEventCount: events.length,
    smsRelatedEventCount: smsRelatedEvents.length,
    sinceDays,
    maxLogPages,
    eventTypes: countBy(smsRelatedEvents, (event) => event.eventType),
    outcomes: countBy(
      smsRelatedEvents,
      (event) =>
        `${event.outcome?.result ?? 'unknown'}:${event.outcome?.reason ?? 'no_reason'}`,
    ),
    providerCounts,
    inlineHookEventTypes: countBy(inlineHookEvents, (event) => event.eventType),
    limitExceededMentions: limitExceededEvents.length,
    latestSmsRelatedEvents: smsRelatedEvents.slice(-20).map((event) => ({
      published: event.published,
      eventType: event.eventType,
      outcome: event.outcome,
      displayMessage: redactText(event.displayMessage),
      targetTypes: (event.target ?? []).map((target) => target.type),
      debugKeys: Object.keys(event.debugContext?.debugData ?? {}).sort(),
    })),
  };
}

const outputDirectory = path.join(repoRoot, 'tmp', 'okta');
fs.mkdirSync(outputDirectory, { recursive: true });

console.log(`Auditing live Okta ${environment.environment} configuration...`);

const customerGroup = await findGroupByName(customerGroupName);
checkObjectExists(
  customerGroup,
  'customer-group.exists',
  `${customerGroupName} customer group exists`,
);

const customerGroupUsers = customerGroup
  ? await listAll(`/api/v1/groups/${customerGroup.id}/users`, { limit: 200 }, 5)
  : [];

const webApp = await findAppByLabel(webAppLabel);
const mobileApp = await findAppByLabel(mobileAppLabel);
checkStatusActive(webApp, 'apps.web.active', `${webAppLabel} app is active`);
checkStatusActive(
  mobileApp,
  'apps.mobile.active',
  `${mobileAppLabel} app is active`,
);

const webAppGroupAssignments = webApp
  ? await listAll(`/api/v1/apps/${webApp.id}/groups`, { limit: 200 })
  : [];
const mobileAppGroupAssignments = mobileApp
  ? await listAll(`/api/v1/apps/${mobileApp.id}/groups`, { limit: 200 })
  : [];

if (webApp) {
  checkNoEveryoneAppAssignment(
    webAppGroupAssignments,
    'apps.web.not-everyone',
    `${webAppLabel} is not assigned to Everyone`,
  );
  addCheck(
    expectedWebRedirectUris.every((uri) =>
      webApp.settings?.oauthClient?.redirect_uris?.includes(uri),
    )
      ? 'pass'
      : 'fail',
    'apps.web.redirects',
    `${webAppLabel} has expected redirect URIs`,
  );
  addCheck(
    expectedWebLogoutUris.every((uri) =>
      webApp.settings?.oauthClient?.post_logout_redirect_uris?.includes(uri),
    )
      ? 'pass'
      : 'fail',
    'apps.web.logout-redirects',
    `${webAppLabel} has expected logout redirect URIs`,
  );
}

if (mobileApp) {
  checkNoEveryoneAppAssignment(
    mobileAppGroupAssignments,
    'apps.mobile.not-everyone',
    `${mobileAppLabel} is not assigned to Everyone`,
  );
  addCheck(
    mobileApp.settings?.oauthClient?.redirect_uris?.includes(
      expectedMobileRedirectUri,
    )
      ? 'pass'
      : 'fail',
    'apps.mobile.redirects',
    `${mobileAppLabel} has expected redirect URI`,
  );
}

const brands = await oktaRequestNullable('/api/v1/brands');
const customerBrand = Array.isArray(brands)
  ? (brands.find((brand) => brand.name === customerBrandName) ?? null)
  : null;
checkObjectExists(
  customerBrand,
  'brand.customer.exists',
  `${customerBrandName} customer brand exists`,
);
const customizedSignInPage = customerBrand
  ? await oktaRequestNullable(
      `/api/v1/brands/${customerBrand.id}/pages/sign-in/customized`,
    )
  : null;
checkObjectExists(
  customizedSignInPage,
  'brand.sign-in.customized',
  `${customerBrandName} customized sign-in page exists`,
);
addCheck(
  customizedSignInPage?.widgetCustomizations?.widgetGeneration ===
    expectedSignInWidgetGeneration
    ? 'pass'
    : 'fail',
  'brand.sign-in.widget-generation',
  `${customerBrandName} sign-in page uses Sign-In Widget ${expectedSignInWidgetGeneration}`,
  customizedSignInPage
    ? `actual=${customizedSignInPage.widgetCustomizations?.widgetGeneration ?? 'missing'}`
    : 'missing',
);

const authenticators = await listAll('/api/v1/authenticators', { limit: 200 });
const authenticatorsByKey = new Map(
  authenticators.map((authenticator) => [authenticator.key, authenticator]),
);
const emailAuthenticator = authenticatorsByKey.get('okta_email');
const passwordAuthenticator = authenticatorsByKey.get('okta_password');
const securityQuestionAuthenticator =
  authenticatorsByKey.get('security_question');
const phoneAuthenticator = authenticatorsByKey.get('phone_number');
const phoneMethods = phoneAuthenticator
  ? await listAll(`/api/v1/authenticators/${phoneAuthenticator.id}/methods`, {
      limit: 100,
    })
  : [];

checkStatusActive(
  emailAuthenticator,
  'authenticators.email.active',
  'Email authenticator is active',
);
checkStatusActive(
  passwordAuthenticator,
  'authenticators.password.active',
  'Password authenticator is active',
);
checkStatusActive(
  securityQuestionAuthenticator,
  'authenticators.security-question.active',
  'Security question authenticator is active',
);

if (environment.okta?.telephony?.enabled) {
  checkStatusActive(
    phoneAuthenticator,
    'authenticators.phone.active',
    'Phone authenticator is active while telephony is enabled',
  );
  addCheck(
    phoneMethods.some(
      (method) =>
        method.type?.toLowerCase() === 'sms' && method.status === 'ACTIVE',
    )
      ? 'pass'
      : 'fail',
    'authenticators.phone.sms-active',
    'Phone authenticator SMS method is active',
  );
  addCheck(
    phoneMethods.some(
      (method) =>
        method.type?.toLowerCase() === 'voice' && method.status === 'INACTIVE',
    )
      ? 'pass'
      : 'warn',
    'authenticators.phone.voice-inactive',
    'Phone authenticator voice method is inactive',
  );
}

const inlineHooks = await listAll('/api/v1/inlineHooks', {
  type: 'com.okta.telephony.provider',
  limit: 200,
});
const telephonyInlineHook =
  inlineHooks.find((hook) => hook.name === telephonyInlineHookName) ?? null;

if (environment.okta?.telephony?.enabled) {
  checkStatusActive(
    telephonyInlineHook,
    'telephony.inline-hook.active',
    `${telephonyInlineHookName} inline hook is active`,
  );
  addCheck(
    telephonyInlineHook?.channel?.config?.uri === expectedTelephonyUri
      ? 'pass'
      : 'fail',
    'telephony.inline-hook.uri',
    `${telephonyInlineHookName} points to the deployed dev hook URI`,
    telephonyInlineHook
      ? `actual=${telephonyInlineHook.channel?.config?.uri}`
      : 'missing',
  );
  addCheck(
    telephonyInlineHook?.channel?.config?.authScheme?.type === 'HEADER' ||
      telephonyInlineHook?.channel?.config?.authScheme?.key === 'Authorization'
      ? 'pass'
      : 'fail',
    'telephony.inline-hook.auth',
    `${telephonyInlineHookName} uses header authorization`,
  );
}

const profileEnrollmentPolicy = await findPolicyByName(
  'PROFILE_ENROLLMENT',
  profileEnrollmentPolicyName,
);
const mfaEnrollmentPolicy = await findPolicyByName(
  'MFA_ENROLL',
  mfaEnrollmentPolicyName,
);
const sessionPolicy = await findPolicyByName('OKTA_SIGN_ON', sessionPolicyName);
const passwordPolicy = await findPolicyByName('PASSWORD', passwordPolicyName);
const accessPolicies = await listAll('/api/v1/policies', {
  type: 'ACCESS_POLICY',
  limit: 200,
});
const accessPolicy =
  accessPolicies.find(
    (policy) =>
      policy.name === accessPolicyName &&
      policy._embedded?.resourceType !== 'END_USER_ACCOUNT_MANAGEMENT',
  ) ?? null;
const accountManagementPolicy = findAccountManagementPolicy(accessPolicies);

const profileEnrollmentRules = await listPolicyRules(profileEnrollmentPolicy);
const mfaEnrollmentRules = await listPolicyRules(mfaEnrollmentPolicy);
const sessionRules = await listPolicyRules(sessionPolicy);
const passwordRules = await listPolicyRules(passwordPolicy);
const accessRules = await listPolicyRules(accessPolicy);
const accountManagementRules = await listPolicyRules(accountManagementPolicy);
const customerGroupId = customerGroup?.id;

checkStatusActive(
  profileEnrollmentPolicy,
  'policies.registration.active',
  `${profileEnrollmentPolicyName} profile enrollment policy is active`,
);
checkStatusActive(
  mfaEnrollmentPolicy,
  'policies.mfa-enrollment.active',
  `${mfaEnrollmentPolicyName} authenticator enrollment policy is active`,
);
checkStatusActive(
  sessionPolicy,
  'policies.session.active',
  `${sessionPolicyName} global session policy is active`,
);
checkStatusActive(
  passwordPolicy,
  'policies.password.active',
  `${passwordPolicyName} password policy is active`,
);
checkStatusActive(
  accessPolicy,
  'policies.access.active',
  `${accessPolicyName} app access policy is active`,
);

if (customerGroupId) {
  addCheck(
    profileEnrollmentRules.some((rule) =>
      hasTargetGroupId(rule, customerGroupId),
    )
      ? 'pass'
      : 'fail',
    'policies.registration.customer-scoped',
    `${profileEnrollmentPolicyName} targets the customer group during registration`,
  );
  checkCustomerScoped(
    mfaEnrollmentPolicy,
    customerGroupId,
    'policies.mfa-enrollment.customer-scoped',
    `${mfaEnrollmentPolicyName} is customer-group scoped`,
  );
  checkCustomerScoped(
    sessionPolicy,
    customerGroupId,
    'policies.session.customer-scoped',
    `${sessionPolicyName} is customer-group scoped`,
  );
  checkCustomerScoped(
    passwordPolicy,
    customerGroupId,
    'policies.password.customer-scoped',
    `${passwordPolicyName} is customer-group scoped`,
  );
}

addCheck(
  sessionRules.some(
    (rule) =>
      rule.actions?.signon?.session?.maxSessionLifetimeMinutes ===
        60 * 24 * 60 &&
      rule.actions?.signon?.session?.maxSessionIdleMinutes === 120,
  )
    ? 'pass'
    : 'warn',
  'policies.session.sixty-days',
  `${sessionPolicyName} has a 60-day maximum lifetime and 120-minute idle timeout`,
);
addCheck(
  accessRules.some((rule) => rule.name === 'ACME LOS High-risk Access')
    ? 'pass'
    : environment.okta?.hostedExperience?.adaptiveMfaOnSignIn
      ? 'fail'
      : 'warn',
  'policies.access.high-risk-rule',
  `${accessPolicyName} has the high-risk adaptive MFA rule`,
);
addCheck(
  accessRules.some((rule) => rule.name === 'ACME LOS Standard Access')
    ? 'pass'
    : 'fail',
  'policies.access.standard-rule',
  `${accessPolicyName} has the standard access rule`,
);
addCheck(
  accessPolicy &&
    (objectLinkId(webApp, 'accessPolicy') === accessPolicy.id ||
      hasOnlyExpectedAppIds(
        accessPolicy,
        [webApp?.id, mobileApp?.id].filter(Boolean),
      )) &&
    (objectLinkId(mobileApp, 'accessPolicy') === accessPolicy.id ||
      hasOnlyExpectedAppIds(
        accessPolicy,
        [webApp?.id, mobileApp?.id].filter(Boolean),
      ))
    ? 'pass'
    : 'warn',
  'policies.access.app-scoped',
  `${accessPolicyName} is scoped to ACME web/mobile app clients`,
);

const expectedAccountManagementRules = customerGroupId
  ? buildAccountManagementPolicyRuleDefinitions({
      environmentName: environment.environment,
      customerGroupId,
      customerGroupName,
      telephonyEnabled: Boolean(environment.okta?.telephony?.enabled),
    })
  : [];

checkStatusActive(
  accountManagementPolicy,
  'policies.account-management.active',
  'Okta account-management policy is active',
);

for (const expectedRule of expectedAccountManagementRules) {
  const liveRule = accountManagementRules.find(
    (rule) => rule.name === expectedRule.name,
  );
  checkStatusActive(
    liveRule,
    `policies.account-management.${expectedRule.id}.active`,
    `${expectedRule.name} account-management rule is active`,
  );
  if (customerGroupId) {
    checkCustomerScoped(
      liveRule,
      customerGroupId,
      `policies.account-management.${expectedRule.id}.customer-scoped`,
      `${expectedRule.name} is customer-group scoped`,
    );
  }
}

const authorizationServerPolicies = await listAuthorizationServerPolicies();
const authorizationServerPolicy =
  authorizationServerPolicies.find(
    (policy) => policy.name === authorizationServerPolicyName,
  ) ?? null;
const authorizationServerRules = authorizationServerPolicy
  ? await listAuthorizationServerRules(authorizationServerPolicy.id)
  : [];
const authorizationServerClaims = await listAuthorizationServerClaims();
const authorizationServerRule = authorizationServerRules.find(
  (rule) => rule.name === authorizationServerRuleName,
);

checkStatusActive(
  authorizationServerPolicy,
  'authorization.policy.active',
  `${authorizationServerPolicyName} authorization server policy is active`,
);
checkStatusActive(
  authorizationServerRule,
  'authorization.rule.active',
  `${authorizationServerRuleName} authorization server rule is active`,
);
addCheck(
  authorizationServerClaims.some(
    (claim) => claim.name === 'customer_id' && claim.claimType === 'IDENTITY',
  ) &&
    authorizationServerClaims.some(
      (claim) => claim.name === 'customer_id' && claim.claimType === 'RESOURCE',
    )
    ? 'pass'
    : 'fail',
  'authorization.claims.customer-id',
  'customer_id claim exists for ID and access tokens',
);
addCheck(
  authorizationServerClaims.some(
    (claim) => claim.name === 'lead_id' && claim.claimType === 'IDENTITY',
  ) &&
    authorizationServerClaims.some(
      (claim) => claim.name === 'lead_id' && claim.claimType === 'RESOURCE',
    )
    ? 'pass'
    : 'fail',
  'authorization.claims.lead-id',
  'lead_id claim exists for ID and access tokens',
);

const userSchema = await oktaRequestNullable(
  '/api/v1/meta/schemas/user/default',
);
const userProperties = userSchema?.definitions?.custom?.properties ?? {};
const acmeStateValues = Array.isArray(userProperties.acmeState?.oneOf)
  ? userProperties.acmeState.oneOf
      .map((option) => option?.const ?? option?.value)
      .filter((value) => typeof value === 'string')
      .sort()
  : [];
addCheck(
  ['leadId', 'customerId', 'acmeState'].every((propertyName) =>
    Object.hasOwn(userProperties, propertyName),
  )
    ? 'pass'
    : 'fail',
  'profile-schema.custom-attributes',
  'leadId, customerId, and acmeState user profile attributes exist',
);
addCheck(
  acmeStateValues.length === 2 &&
    acmeStateValues[0] === 'MO' &&
    acmeStateValues[1] === 'TX'
    ? 'pass'
    : 'fail',
  'profile-schema.acme-state-dropdown',
  'acmeState is limited to Missouri and Texas',
);

const since = new Date(
  Date.now() -
    (Number.isFinite(sinceDays) ? sinceDays : 7) * 24 * 60 * 60 * 1000,
).toISOString();
const systemLogEvents = await listAll(
  '/api/v1/logs',
  {
    since,
    limit: 1000,
  },
  Number.isFinite(maxLogPages) ? maxLogPages : 10,
);
const systemLogSummary = summarizeSystemLogEvents(systemLogEvents);

addCheck(
  systemLogSummary.limitExceededMentions === 0 ? 'pass' : 'warn',
  'system-log.sms-limit',
  'Recent Okta System Log has no SMS limit-exceeded mentions',
  `mentions=${systemLogSummary.limitExceededMentions}`,
);
addCheck(
  environment.okta?.telephony?.enabled &&
    systemLogSummary.smsRelatedEventCount > 0 &&
    systemLogSummary.inlineHookEventTypes &&
    Object.keys(systemLogSummary.inlineHookEventTypes).length === 0
    ? 'warn'
    : 'pass',
  'system-log.telephony-inline-hook-events',
  'Recent SMS/phone-related events include inline-hook evidence when SMS is attempted',
);

addCheck(
  'info',
  'org-feature-boundaries',
  'Okta authenticator activation, risk scoring, and device signals are org features; app/customer-group policies scope ACME consumption where Okta exposes rule conditions',
);

const policyPlan = resolveOktaPolicyPlan({
  environmentName: environment.environment,
  hostedExperience: environment.okta?.hostedExperience,
  telephonyEnabled: Boolean(environment.okta?.telephony?.enabled),
  manifest: policyScenarioManifest,
});

const result = {
  generatedAt: new Date().toISOString(),
  environment: environment.environment,
  oktaOrg: oktaApiBaseUrl,
  tokenSource: token.source,
  manifest: {
    issuer,
    webClientId: environment.okta?.webClientId,
    mobileClientId: environment.okta?.mobileClientId,
    telephonyEnabled: Boolean(environment.okta?.telephony?.enabled),
    phoneEnrollmentRequired: Boolean(
      environment.okta?.hostedExperience?.registrationRequiresPhoneVerification,
    ),
    phoneEnrollmentMode: environment.okta?.telephony?.enabled
      ? environment.okta?.hostedExperience
          ?.registrationRequiresPhoneVerification
        ? 'required'
        : 'optional'
      : 'disabled',
  },
  scopeModel: policyPlan.scopeModel,
  live: {
    customerGroup: customerGroup
      ? {
          id: customerGroup.id,
          name: customerGroup.profile?.name,
          userCountScanned: customerGroupUsers.length,
          sampleUsers: customerGroupUsers.slice(0, 20).map((user) => ({
            id: user.id,
            status: user.status,
            login: maskEmail(user.profile?.login),
            email: maskEmail(user.profile?.email),
          })),
        }
      : null,
    apps: {
      web: summarizeApp(webApp),
      mobile: summarizeApp(mobileApp),
      groupAssignments: {
        web: webAppGroupAssignments.map((assignment) => ({
          id: assignment.id,
          name: assignment.profile?.name,
          priority: assignment.priority,
        })),
        mobile: mobileAppGroupAssignments.map((assignment) => ({
          id: assignment.id,
          name: assignment.profile?.name,
          priority: assignment.priority,
        })),
      },
    },
    hostedSignIn: {
      brand: customerBrand
        ? {
            id: customerBrand.id,
            name: customerBrand.name,
            isDefault: customerBrand.isDefault,
          }
        : null,
      customizedPage: customizedSignInPage
        ? {
            widgetVersion: customizedSignInPage.widgetVersion,
            widgetGeneration:
              customizedSignInPage.widgetCustomizations?.widgetGeneration,
            pageContentLength: customizedSignInPage.pageContent?.length ?? 0,
          }
        : null,
    },
    authenticators: {
      email: summarizeAuthenticator(emailAuthenticator),
      password: summarizeAuthenticator(passwordAuthenticator),
      securityQuestion: summarizeAuthenticator(securityQuestionAuthenticator),
      phone: summarizeAuthenticator(phoneAuthenticator, phoneMethods),
    },
    telephonyInlineHook: telephonyInlineHook
      ? {
          id: telephonyInlineHook.id,
          name: telephonyInlineHook.name,
          status: telephonyInlineHook.status,
          type: telephonyInlineHook.type,
          uri: telephonyInlineHook.channel?.config?.uri,
          authScheme: telephonyInlineHook.channel?.config?.authScheme?.type,
        }
      : null,
    policies: {
      profileEnrollment: summarizePolicy(
        profileEnrollmentPolicy,
        profileEnrollmentRules,
      ),
      mfaEnrollment: summarizePolicy(mfaEnrollmentPolicy, mfaEnrollmentRules),
      globalSession: summarizePolicy(sessionPolicy, sessionRules),
      password: summarizePolicy(passwordPolicy, passwordRules),
      appAccess: summarizePolicy(accessPolicy, accessRules),
      accountManagement: summarizePolicy(
        accountManagementPolicy,
        accountManagementRules,
      ),
      authorizationServer: authorizationServerPolicy
        ? {
            id: authorizationServerPolicy.id,
            name: authorizationServerPolicy.name,
            status: authorizationServerPolicy.status,
            rules: summarizeRules(authorizationServerRules),
            claims: authorizationServerClaims
              .filter((claim) =>
                ['lead_id', 'customer_id'].includes(claim.name),
              )
              .map((claim) => ({
                id: claim.id,
                name: claim.name,
                status: claim.status,
                claimType: claim.claimType,
                valueType: claim.valueType,
                value: claim.value,
                conditions: claim.conditions,
              })),
          }
        : null,
    },
    profileSchema: {
      customAttributes: Object.fromEntries(
        ['leadId', 'customerId', 'acmeState'].map((propertyName) => [
          propertyName,
          userProperties[propertyName]
            ? {
                title: userProperties[propertyName].title,
                type: userProperties[propertyName].type,
                permissions: userProperties[propertyName].permissions,
                enumCount: userProperties[propertyName].oneOf?.length,
              }
            : null,
        ]),
      ),
    },
    systemLog: systemLogSummary,
  },
  expectedAccountManagementRules: expectedAccountManagementRules.map(
    (definition) => ({
      id: definition.id,
      name: definition.name,
      priority: definition.priority,
      expectedProofs: definition.expectedProofs,
      expectedPossessionFactors: definition.expectedPossessionFactors,
    }),
  ),
  checks,
  warnings,
};

const outputPath = path.join(
  outputDirectory,
  `${environment.environment}.live-okta-audit.json`,
);
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

const counts = countBy(checks, (check) => check.status);
console.log('');
console.log(
  `Live Okta audit written to ${path.relative(repoRoot, outputPath)}`,
);
console.log(
  `Checks: pass=${counts.pass ?? 0}, warn=${counts.warn ?? 0}, fail=${counts.fail ?? 0}, info=${counts.info ?? 0}`,
);

for (const check of checks.filter((entry) => entry.status !== 'pass')) {
  console.log(`- ${check.status.toUpperCase()}: ${check.title}`);
  if (check.details) {
    console.log(`  ${check.details}`);
  }
}

if (warnings.length > 0) {
  console.log('');
  console.log('API warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if ((counts.fail ?? 0) > 0) {
  process.exitCode = 1;
}

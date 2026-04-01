import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const fullCleanup = process.argv.includes('--all');

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/okta/cleanup-okta.mjs <dev|qa|stg|prod> [--dry-run] [--all]',
  );
  process.exit(1);
}

if (!dryRun && !process.env.OKTA_API_TOKEN?.trim()) {
  console.error('Set OKTA_API_TOKEN before running the Okta cleanup script.');
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
const cleanupOutputsPath = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.cleanup.outputs.json`,
);

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const brandProfile = JSON.parse(fs.readFileSync(brandProfilePath, 'utf8'));
const bootstrapOutputs = fs.existsSync(bootstrapOutputsPath)
  ? JSON.parse(fs.readFileSync(bootstrapOutputsPath, 'utf8'))
  : {};
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const token = process.env.OKTA_API_TOKEN?.trim();
const canQueryLive = Boolean(token);

const webLabel = `ACME LOS Web (${environment.environment})`;
const mobileLabel = `ACME LOS Mobile (${environment.environment})`;
const trustedOriginValue = requiredString(
  environment.web?.baseUrl,
  'web.baseUrl',
);
const customerGroupName = `acme-los-customers-${environment.environment}`;
const mfaEnrollmentPolicyName = `ACME LOS Authenticator Enrollment (${environment.environment})`;
const sessionPolicyName = `ACME LOS Global Session (${environment.environment})`;
const accessPolicyName = `ACME LOS App Access (${environment.environment})`;
const customerBrandName = requiredString(
  brandProfile.customerBrandName,
  'brand.customerBrandName',
);

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${fieldName}" to be a non-empty string.`);
  }

  return value.trim();
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

async function oktaRequest(
  method,
  pathname,
  body = undefined,
  query = undefined,
) {
  const url = new URL(pathname, oktaApiBaseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `SSWS ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function getAppById(id) {
  return oktaRequestNullable('GET', `/api/v1/apps/${id}`);
}

async function deleteApp(app, fallbackLabel) {
  if (!app) {
    return { mode: 'missing', label: fallbackLabel };
  }

  if (app.status !== 'INACTIVE') {
    await oktaRequest('POST', `/api/v1/apps/${app.id}/lifecycle/deactivate`);
  }

  await oktaRequest('DELETE', `/api/v1/apps/${app.id}`);
  return { mode: 'deleted', id: app.id, label: app.label ?? fallbackLabel };
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

async function deleteTrustedOrigin(trustedOrigin) {
  if (!trustedOrigin) {
    return { mode: 'missing' };
  }

  await oktaRequest('DELETE', `/api/v1/trustedOrigins/${trustedOrigin.id}`);
  return {
    mode: 'deleted',
    id: trustedOrigin.id,
    origin: trustedOrigin.origin,
  };
}

async function findGroupByName(name) {
  const groups = await oktaRequest('GET', '/api/v1/groups', undefined, {
    search: `profile.name eq "${name.replaceAll('"', '\\"')}"`,
    limit: '200',
  });
  return groups.find((group) => group?.profile?.name === name) ?? null;
}

async function deleteGroup(group, fallbackName) {
  if (!group) {
    return { mode: 'missing', name: fallbackName };
  }

  await oktaRequest('DELETE', `/api/v1/groups/${group.id}`);
  return {
    mode: 'deleted',
    id: group.id,
    name: group.profile?.name ?? group.id,
  };
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

async function deletePolicy(policy, fallbackName) {
  if (!policy) {
    return { mode: 'missing', name: fallbackName };
  }

  await oktaRequest('DELETE', `/api/v1/policies/${policy.id}`);
  return { mode: 'deleted', id: policy.id, name: policy.name };
}

async function listBrands() {
  return oktaRequest('GET', '/api/v1/brands');
}

async function findCustomerBrandByName(name) {
  const brands = await listBrands();
  return (
    brands.find((brand) => !brand.isDefault && brand.name === name) ?? null
  );
}

async function deleteBrand(brand, fallbackName) {
  if (!brand) {
    return { mode: 'missing', name: fallbackName };
  }

  try {
    await oktaRequest('DELETE', `/api/v1/brands/${brand.id}`);
    return { mode: 'deleted', id: brand.id, name: brand.name };
  } catch (error) {
    if (error instanceof Error && error.message.includes('E0000201')) {
      return {
        mode: 'retained',
        id: brand.id,
        name: brand.name,
        reason: 'Brand is attached to a custom domain or email domain.',
      };
    }

    throw error;
  }
}

async function deleteCustomizedBrandPage(brandId, pageName) {
  const response = await oktaRequestNullable(
    'DELETE',
    `/api/v1/brands/${brandId}/pages/${pageName}/customized`,
  );

  if (response === null) {
    return { mode: 'missing', page: pageName };
  }

  return { mode: 'deleted', page: pageName };
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

async function deleteAuthorizationServerPolicy(
  authServerId,
  policy,
  fallbackName,
) {
  if (!policy) {
    return { mode: 'missing', name: fallbackName };
  }

  await oktaRequest(
    'DELETE',
    `/api/v1/authorizationServers/${authServerId}/policies/${policy.id}`,
  );
  return { mode: 'deleted', id: policy.id, name: policy.name };
}

async function getAuthorizationServerPolicyById(authServerId, policyId) {
  return oktaRequestNullable(
    'GET',
    `/api/v1/authorizationServers/${authServerId}/policies/${policyId}`,
  );
}

const authorizationServerId = resolveAuthorizationServerId(issuer);
const authorizationServerPolicyName = `ACME LOS Default Authorization (${environment.environment})`;

const webApp = canQueryLive
  ? ((typeof bootstrapOutputs.webAppId === 'string' && bootstrapOutputs.webAppId
      ? await getAppById(bootstrapOutputs.webAppId)
      : null) ?? (await findApplicationByLabel(webLabel)))
  : typeof bootstrapOutputs.webAppId === 'string' && bootstrapOutputs.webAppId
    ? { id: bootstrapOutputs.webAppId, label: webLabel, status: 'UNKNOWN' }
    : null;
const mobileApp = canQueryLive
  ? ((typeof bootstrapOutputs.mobileAppId === 'string' &&
    bootstrapOutputs.mobileAppId
      ? await getAppById(bootstrapOutputs.mobileAppId)
      : null) ?? (await findApplicationByLabel(mobileLabel)))
  : typeof bootstrapOutputs.mobileAppId === 'string' &&
      bootstrapOutputs.mobileAppId
    ? {
        id: bootstrapOutputs.mobileAppId,
        label: mobileLabel,
        status: 'UNKNOWN',
      }
    : null;

let trustedOrigin = null;
let customerGroup = null;
let mfaPolicy = null;
let sessionPolicy = null;
let accessPolicy = null;
let customerBrand = null;
let authorizationServerPolicy = null;

if (fullCleanup) {
  if (canQueryLive) {
    trustedOrigin =
      (typeof bootstrapOutputs.trustedOriginId === 'string' &&
      bootstrapOutputs.trustedOriginId
        ? await oktaRequestNullable(
            'GET',
            `/api/v1/trustedOrigins/${bootstrapOutputs.trustedOriginId}`,
          )
        : null) ?? (await findTrustedOriginByOrigin(trustedOriginValue));
    customerGroup =
      (typeof bootstrapOutputs.customerGroupId === 'string' &&
      bootstrapOutputs.customerGroupId
        ? await oktaRequestNullable(
            'GET',
            `/api/v1/groups/${bootstrapOutputs.customerGroupId}`,
          )
        : null) ?? (await findGroupByName(customerGroupName));
    mfaPolicy = await findPolicyByTypeAndName(
      'MFA_ENROLL',
      mfaEnrollmentPolicyName,
    );
    sessionPolicy = await findPolicyByTypeAndName(
      'OKTA_SIGN_ON',
      sessionPolicyName,
    );
    accessPolicy = await findPolicyByTypeAndName(
      'ACCESS_POLICY',
      accessPolicyName,
    );
    authorizationServerPolicy =
      (typeof bootstrapOutputs.authorizationServerPolicyId === 'string' &&
      bootstrapOutputs.authorizationServerPolicyId
        ? await getAuthorizationServerPolicyById(
            authorizationServerId,
            bootstrapOutputs.authorizationServerPolicyId,
          )
        : null) ??
      (await findAuthorizationServerPolicyByName(
        authorizationServerId,
        authorizationServerPolicyName,
      ));
    customerBrand =
      (typeof bootstrapOutputs.customerBrandId === 'string' &&
      bootstrapOutputs.customerBrandId
        ? await oktaRequestNullable(
            'GET',
            `/api/v1/brands/${bootstrapOutputs.customerBrandId}`,
          )
        : null) ?? (await findCustomerBrandByName(customerBrandName));
  } else {
    trustedOrigin =
      typeof bootstrapOutputs.trustedOriginId === 'string' &&
      bootstrapOutputs.trustedOriginId
        ? { id: bootstrapOutputs.trustedOriginId, origin: trustedOriginValue }
        : null;
    customerGroup =
      typeof bootstrapOutputs.customerGroupId === 'string' &&
      bootstrapOutputs.customerGroupId
        ? {
            id: bootstrapOutputs.customerGroupId,
            profile: { name: customerGroupName },
          }
        : null;
    mfaPolicy =
      typeof bootstrapOutputs.mfaEnrollmentPolicyId === 'string' &&
      bootstrapOutputs.mfaEnrollmentPolicyId
        ? {
            id: bootstrapOutputs.mfaEnrollmentPolicyId,
            name: mfaEnrollmentPolicyName,
          }
        : null;
    sessionPolicy =
      typeof bootstrapOutputs.sessionPolicyId === 'string' &&
      bootstrapOutputs.sessionPolicyId
        ? { id: bootstrapOutputs.sessionPolicyId, name: sessionPolicyName }
        : null;
    accessPolicy =
      typeof bootstrapOutputs.accessPolicyId === 'string' &&
      bootstrapOutputs.accessPolicyId
        ? { id: bootstrapOutputs.accessPolicyId, name: accessPolicyName }
        : null;
    authorizationServerPolicy =
      typeof bootstrapOutputs.authorizationServerPolicyId === 'string' &&
      bootstrapOutputs.authorizationServerPolicyId
        ? {
            id: bootstrapOutputs.authorizationServerPolicyId,
            name: authorizationServerPolicyName,
          }
        : null;
    customerBrand =
      typeof bootstrapOutputs.customerBrandId === 'string' &&
      bootstrapOutputs.customerBrandId
        ? { id: bootstrapOutputs.customerBrandId, name: customerBrandName }
        : null;
  }
}

const cleanupPlan = {
  environment: environmentName,
  mode: dryRun ? 'dry-run' : fullCleanup ? 'all' : 'apps-only',
  oktaApiBaseUrl,
  targets: {
    webApp: webApp
      ? { id: webApp.id, label: webApp.label, status: webApp.status }
      : null,
    mobileApp: mobileApp
      ? { id: mobileApp.id, label: mobileApp.label, status: mobileApp.status }
      : null,
    trustedOrigin: trustedOrigin
      ? { id: trustedOrigin.id, origin: trustedOrigin.origin }
      : null,
    customerGroup: customerGroup
      ? {
          id: customerGroup.id,
          name: customerGroup.profile?.name ?? customerGroup.id,
        }
      : null,
    mfaEnrollmentPolicy: mfaPolicy
      ? { id: mfaPolicy.id, name: mfaPolicy.name }
      : null,
    sessionPolicy: sessionPolicy
      ? { id: sessionPolicy.id, name: sessionPolicy.name }
      : null,
    accessPolicy: accessPolicy
      ? { id: accessPolicy.id, name: accessPolicy.name }
      : null,
    authorizationServerPolicy: authorizationServerPolicy
      ? {
          id: authorizationServerPolicy.id,
          name: authorizationServerPolicy.name,
        }
      : null,
    customerBrand: customerBrand
      ? { id: customerBrand.id, name: customerBrand.name }
      : null,
  },
};

if (dryRun) {
  writeJsonFile(cleanupOutputsPath, cleanupPlan);
  console.log(`Prepared Okta cleanup plan for "${environmentName}".`);
  console.log(`- Preview file: ${path.relative(repoRoot, cleanupOutputsPath)}`);
  process.exit(0);
}

const results = {
  environment: environmentName,
  mode: fullCleanup ? 'all' : 'apps-only',
  oktaApiBaseUrl,
  apps: [],
  deletedTrustedOrigin: null,
  deletedCustomerGroup: null,
  deletedPolicies: [],
  deletedAuthorizationServerPolicy: null,
  deletedHostedPages: [],
  deletedCustomerBrand: null,
};

for (const { app, label } of [
  { app: webApp, label: webLabel },
  { app: mobileApp, label: mobileLabel },
]) {
  const appResult = await deleteApp(app, label);
  results.apps.push(appResult);
}

if (fullCleanup) {
  results.deletedTrustedOrigin = await deleteTrustedOrigin(trustedOrigin);
  results.deletedPolicies.push(
    await deletePolicy(accessPolicy, accessPolicyName),
  );
  results.deletedPolicies.push(
    await deletePolicy(sessionPolicy, sessionPolicyName),
  );
  results.deletedPolicies.push(
    await deletePolicy(mfaPolicy, mfaEnrollmentPolicyName),
  );
  results.deletedAuthorizationServerPolicy =
    await deleteAuthorizationServerPolicy(
      authorizationServerId,
      authorizationServerPolicy,
      authorizationServerPolicyName,
    );
  results.deletedCustomerGroup = await deleteGroup(
    customerGroup,
    customerGroupName,
  );
  if (customerBrand?.id) {
    results.deletedHostedPages.push(
      await deleteCustomizedBrandPage(customerBrand.id, 'sign-in'),
    );
    results.deletedHostedPages.push(
      await deleteCustomizedBrandPage(customerBrand.id, 'error'),
    );
  }
  results.deletedCustomerBrand = await deleteBrand(
    customerBrand,
    customerBrandName,
  );
}

environment.okta.webClientId = '';
environment.okta.mobileClientId = '';
writeJsonFile(environmentPath, environment);

for (const filePath of [bootstrapOutputsPath]) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

writeJsonFile(cleanupOutputsPath, results);
renderEnvironment();

console.log(`Cleaned Okta resources for "${environmentName}".`);
for (const appResult of results.apps) {
  console.log(
    `- App ${appResult.label ?? 'unknown'}: ${appResult.mode}${appResult.id ? ` (${appResult.id})` : ''}`,
  );
}
if (fullCleanup) {
  console.log(
    `- Trusted origin: ${results.deletedTrustedOrigin?.mode ?? 'missing'}${
      results.deletedTrustedOrigin?.id
        ? ` (${results.deletedTrustedOrigin.id})`
        : ''
    }`,
  );
  console.log(
    `- Customer group: ${results.deletedCustomerGroup?.mode ?? 'missing'}${
      results.deletedCustomerGroup?.id
        ? ` (${results.deletedCustomerGroup.id})`
        : ''
    }`,
  );
  console.log(
    `- Customer brand: ${results.deletedCustomerBrand?.mode ?? 'missing'}${
      results.deletedCustomerBrand?.id
        ? ` (${results.deletedCustomerBrand.id})`
        : ''
    }`,
  );
  for (const policyResult of results.deletedPolicies) {
    console.log(
      `- Policy ${policyResult.name ?? 'unknown'}: ${policyResult.mode}${
        policyResult.id ? ` (${policyResult.id})` : ''
      }`,
    );
  }
  console.log(
    `- Authorization server policy: ${
      results.deletedAuthorizationServerPolicy?.mode ?? 'missing'
    }${
      results.deletedAuthorizationServerPolicy?.id
        ? ` (${results.deletedAuthorizationServerPolicy.id})`
        : ''
    }`,
  );
  for (const pageResult of results.deletedHostedPages) {
    console.log(`- Hosted page ${pageResult.page}: ${pageResult.mode}`);
  }
}
console.log(`- Cleanup report: ${path.relative(repoRoot, cleanupOutputsPath)}`);

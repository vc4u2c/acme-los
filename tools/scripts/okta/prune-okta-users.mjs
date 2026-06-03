import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const confirmDeactivate =
  process.argv.includes('--confirm-deactivate') ||
  getNpmConfigBoolean('confirm-deactivate');
const includeAdmins =
  process.argv.includes('--include-admins') ||
  getNpmConfigBoolean('include-admins');
const dryRun =
  !confirmDeactivate ||
  process.argv.includes('--dry-run') ||
  getNpmConfigBoolean('dry-run');

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/okta/prune-okta-users.mjs <dev|qa|stg|prod> [--dry-run] [--confirm-deactivate] [--include-admins]',
  );
  process.exit(1);
}

if (!process.env.OKTA_API_TOKEN?.trim()) {
  console.error('Set OKTA_API_TOKEN before planning or pruning Okta users.');
  process.exit(1);
}

const environmentPath = path.join(
  repoRoot,
  'infra',
  'okta',
  'environments',
  `${environmentName}.json`,
);
const outputsPath = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.user-prune.outputs.json`,
);

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const token = process.env.OKTA_API_TOKEN?.trim();
const userPruneConfig = environment.okta?.userPrune ?? {};
const enabled = userPruneConfig.enabled === true;
const action = optionalString(userPruneConfig.action) ?? 'deactivate';
const keepLogins = readKeepLogins(userPruneConfig.keepLogins);
const keepProfileContains = readKeepLogins(userPruneConfig.keepProfileContains);
const keepLoginSet = new Set(keepLogins.map(normalizeLogin));
const keepProfileTerms = keepProfileContains.map(normalizeLogin);

if (action !== 'deactivate') {
  throw new Error(
    `Unsupported okta.userPrune.action "${action}". Use "deactivate".`,
  );
}

if (!enabled && confirmDeactivate) {
  throw new Error(
    'Set okta.userPrune.enabled to true before running --confirm-deactivate.',
  );
}

if (
  confirmDeactivate &&
  keepLogins.length === 0 &&
  keepProfileTerms.length === 0
) {
  throw new Error(
    'Set okta.userPrune.keepLogins or okta.userPrune.keepProfileContains before running --confirm-deactivate.',
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

function getNpmConfigValue(name) {
  const value = process.env[`npm_config_${name.replaceAll('-', '_')}`];
  return value?.trim() || undefined;
}

function getNpmConfigBoolean(name) {
  const value = getNpmConfigValue(name);
  return value === 'true' || value === '';
}

function readKeepLogins(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map((value) => optionalString(value))
        .filter((value) => typeof value === 'string'),
    ),
  ];
}

function normalizeLogin(value) {
  return value.trim().toLowerCase();
}

function writeJsonFile(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function appendQuery(url, query) {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      url.searchParams.set(key, `${value}`);
    }
  }
}

async function oktaFetch(method, pathnameOrUrl, { body, headers, query } = {}) {
  const url = pathnameOrUrl.startsWith('http')
    ? new URL(pathnameOrUrl)
    : new URL(pathnameOrUrl, oktaApiBaseUrl);

  appendQuery(url, query);

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `SSWS ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
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

  const text = response.status === 204 ? '' : await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;

  return {
    payload,
    headers: response.headers,
  };
}

function getNextLink(headers) {
  const linkHeader = headers.get('link');
  if (!linkHeader) {
    return null;
  }

  for (const link of linkHeader.split(',')) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function listAllUsers() {
  const users = [];
  let nextUrl = '/api/v1/users';

  while (nextUrl) {
    const response = await oktaFetch('GET', nextUrl, {
      query: nextUrl.startsWith('http') ? undefined : { limit: '200' },
    });
    users.push(...(Array.isArray(response.payload) ? response.payload : []));
    nextUrl = getNextLink(response.headers);
  }

  return users;
}

async function listUserRoles(userId) {
  const response = await oktaFetch('GET', `/api/v1/users/${userId}/roles`);
  return Array.isArray(response.payload) ? response.payload : [];
}

function describeUser(user) {
  const displayName = [user.profile?.firstName, user.profile?.lastName]
    .filter(Boolean)
    .join(' ');

  return {
    id: user.id,
    status: user.status,
    login: user.profile?.login ?? '',
    email: user.profile?.email ?? '',
    displayName,
  };
}

function isKeptUser(user) {
  const login = optionalString(user.profile?.login);
  const email = optionalString(user.profile?.email);
  const searchableProfileText = [
    login,
    email,
    optionalString(user.profile?.firstName),
    optionalString(user.profile?.lastName),
    optionalString(user.profile?.displayName),
    [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matchesExplicitLogin = [login, email].some(
    (value) => value && keepLoginSet.has(normalizeLogin(value)),
  );

  return (
    matchesExplicitLogin ||
    keepProfileTerms.some((term) => searchableProfileText.includes(term))
  );
}

function isDeactivatable(user) {
  return user.status !== 'DEPROVISIONED';
}

async function buildPlan() {
  const users = await listAllUsers();
  const retained = [];
  const candidates = [];
  const skipped = [];

  for (const user of users) {
    const describedUser = describeUser(user);

    if (isKeptUser(user)) {
      retained.push(describedUser);
      continue;
    }

    if (!isDeactivatable(user)) {
      skipped.push({
        ...describedUser,
        reason: 'already-deprovisioned',
      });
      continue;
    }

    const roles = await listUserRoles(user.id);
    if (roles.length > 0 && !includeAdmins) {
      skipped.push({
        ...describedUser,
        reason: 'admin-role',
        roles: roles.map((role) => role.label ?? role.type ?? role.id),
      });
      continue;
    }

    candidates.push({
      ...describedUser,
      roles: roles.map((role) => role.label ?? role.type ?? role.id),
    });
  }

  const matchedKeepLogins = new Set(
    retained.flatMap((user) => [user.login, user.email].map(normalizeLogin)),
  );
  const missingKeepLogins = keepLogins.filter(
    (login) => !matchedKeepLogins.has(normalizeLogin(login)),
  );

  return {
    environment: environmentName,
    mode: dryRun ? 'dry-run' : 'confirm-deactivate',
    oktaApiBaseUrl,
    enabled,
    action,
    includeAdmins,
    keepLogins,
    keepProfileContains,
    missingKeepLogins,
    retained,
    deactivationCandidates: candidates,
    skipped,
  };
}

async function deactivateUser(user) {
  await oktaFetch('POST', `/api/v1/users/${user.id}/lifecycle/deactivate`, {
    headers: {
      Prefer: 'respond-async',
    },
    query: {
      sendEmail: 'false',
    },
  });

  return {
    id: user.id,
    login: user.login,
    mode: 'deactivation-requested',
  };
}

const plan = await buildPlan();

if (plan.missingKeepLogins.length > 0 && confirmDeactivate) {
  writeJsonFile(outputsPath, plan);
  throw new Error(
    `Refusing to deactivate users because these keepLogins were not found: ${plan.missingKeepLogins.join(', ')}`,
  );
}

if (dryRun) {
  writeJsonFile(outputsPath, plan);
  console.log(`Prepared Okta user prune plan for "${environmentName}".`);
  console.log(`- Users retained: ${plan.retained.length}`);
  console.log(
    `- Users that would be deactivated: ${plan.deactivationCandidates.length}`,
  );
  console.log(`- Users skipped: ${plan.skipped.length}`);
  console.log(`- Preview file: ${path.relative(repoRoot, outputsPath)}`);
  process.exit(0);
}

const results = {
  ...plan,
  deactivated: [],
};

for (const user of plan.deactivationCandidates) {
  results.deactivated.push(await deactivateUser(user));
}

writeJsonFile(outputsPath, results);
console.log(`Pruned Okta users for "${environmentName}".`);
console.log(`- Users retained: ${results.retained.length}`);
console.log(`- Deactivation requests: ${results.deactivated.length}`);
console.log(`- Users skipped: ${results.skipped.length}`);
console.log(`- Report file: ${path.relative(repoRoot, outputsPath)}`);

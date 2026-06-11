import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const args = process.argv.slice(3);
const confirmDeactivate =
  hasFlag('--confirm-deactivate') || getNpmConfigBoolean('confirm-deactivate');
const confirmDelete =
  hasFlag('--confirm-delete') || getNpmConfigBoolean('confirm-delete');
const includeAdmins =
  hasFlag('--include-admins') || getNpmConfigBoolean('include-admins');
const allowTokenOwner =
  hasFlag('--allow-token-owner') || getNpmConfigBoolean('allow-token-owner');
const dryRun =
  (!confirmDeactivate && !confirmDelete) ||
  hasFlag('--dry-run') ||
  getNpmConfigBoolean('dry-run');

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/okta/prune-okta-users.mjs <dev|qa|stg|prod> [--dry-run] [--confirm-deactivate|--confirm-delete] [--include-admins] [--allow-token-owner]',
  );
  process.exit(1);
}

if (confirmDeactivate && confirmDelete) {
  throw new Error(
    'Choose either --confirm-deactivate or --confirm-delete, not both.',
  );
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

if (!['deactivate', 'delete'].includes(action)) {
  throw new Error(
    `Unsupported okta.userPrune.action "${action}". Use "deactivate" or "delete".`,
  );
}

if (!enabled && (confirmDeactivate || confirmDelete)) {
  throw new Error(
    'Set okta.userPrune.enabled to true before running a confirmed prune.',
  );
}

if (
  (confirmDeactivate || confirmDelete) &&
  keepLogins.length === 0 &&
  keepProfileTerms.length === 0
) {
  throw new Error(
    'Set okta.userPrune.keepLogins or okta.userPrune.keepProfileContains before running a confirmed prune.',
  );
}

if (confirmDelete && action !== 'delete') {
  throw new Error(
    'Set okta.userPrune.action to "delete" before running --confirm-delete.',
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

function hasFlag(flagName) {
  return args.includes(flagName);
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

async function getCurrentUser() {
  try {
    const response = await oktaFetch('GET', '/api/v1/users/me');
    return response.payload;
  } catch (error) {
    return {
      id: undefined,
      status: undefined,
      profile: {
        login: undefined,
        email: undefined,
      },
      lookupError: error instanceof Error ? error.message : `${error}`,
    };
  }
}

async function getUser(userId) {
  const response = await oktaFetch('GET', `/api/v1/users/${userId}`);
  return response.payload;
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

function sleep(delayMilliseconds) {
  return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
}

async function waitForDeprovisioned(userId) {
  const maxAttempts = 30;
  const delayMilliseconds = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const user = await getUser(userId);
    if (user.status === 'DEPROVISIONED') {
      return user;
    }

    await sleep(delayMilliseconds);
  }

  throw new Error(
    `Timed out waiting for user "${userId}" to reach DEPROVISIONED status.`,
  );
}

function isDeactivationInProgressError(error) {
  return (
    error instanceof Error &&
    (error.message.includes('E0000038') ||
      error.message.toLowerCase().includes('deactivation is in progress'))
  );
}

async function deleteUserWhenReady(userId) {
  const maxAttempts = 30;
  const delayMilliseconds = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await oktaFetch('DELETE', `/api/v1/users/${userId}`);
      return;
    } catch (error) {
      if (!isDeactivationInProgressError(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(delayMilliseconds);
    }
  }
}

async function buildPlan() {
  const [users, currentUser] = await Promise.all([
    listAllUsers(),
    getCurrentUser(),
  ]);
  const retained = [];
  const candidates = [];
  const skipped = [];
  const tokenOwnerId = currentUser?.id;

  for (const user of users) {
    const roles = await listUserRoles(user.id);
    const roleLabels = roles.map((role) => role.label ?? role.type ?? role.id);
    const describedUser = {
      ...describeUser(user),
      roles: roleLabels,
      isTokenOwner: Boolean(tokenOwnerId && user.id === tokenOwnerId),
    };

    if (isKeptUser(user)) {
      retained.push(describedUser);
      continue;
    }

    if (!isDeactivatable(user) && action !== 'delete') {
      skipped.push({
        ...describedUser,
        reason: 'already-deprovisioned',
      });
      continue;
    }

    if (roleLabels.length > 0 && !includeAdmins) {
      skipped.push({
        ...describedUser,
        reason: 'admin-role',
      });
      continue;
    }

    if (describedUser.isTokenOwner && !allowTokenOwner) {
      skipped.push({
        ...describedUser,
        reason: 'api-token-owner',
      });
      continue;
    }

    candidates.push({
      ...describedUser,
      plannedAction:
        action === 'delete'
          ? user.status === 'DEPROVISIONED'
            ? 'delete'
            : 'deactivate-and-delete'
          : 'deactivate',
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
    mode: dryRun
      ? 'dry-run'
      : confirmDelete
        ? 'confirm-delete'
        : 'confirm-deactivate',
    oktaApiBaseUrl,
    enabled,
    action,
    includeAdmins,
    allowTokenOwner,
    keepLogins,
    keepProfileContains,
    missingKeepLogins,
    tokenOwner: currentUser?.lookupError
      ? { lookupError: currentUser.lookupError }
      : describeUser(currentUser),
    retained,
    deactivationCandidates: candidates.filter(
      (user) => user.status !== 'DEPROVISIONED',
    ),
    deletionCandidates: action === 'delete' ? candidates : [],
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
    ...user,
    mode: 'deactivation-requested',
  };
}

async function deactivateAndDeleteUser(user) {
  const result = {
    ...user,
    operations: [],
  };

  if (user.status !== 'DEPROVISIONED') {
    await oktaFetch('POST', `/api/v1/users/${user.id}/lifecycle/deactivate`, {
      headers: {
        Prefer: 'respond-async',
      },
      query: {
        sendEmail: 'false',
      },
    });
    result.operations.push('deactivation-requested');
    await waitForDeprovisioned(user.id);
    result.operations.push('deprovisioned-confirmed');
  }

  await deleteUserWhenReady(user.id);
  result.operations.push('deleted');

  return result;
}

const plan = await buildPlan();

if (
  plan.tokenOwner?.lookupError &&
  (confirmDeactivate || confirmDelete) &&
  !allowTokenOwner
) {
  writeJsonFile(outputsPath, plan);
  throw new Error(
    `Refusing to prune users because the API token owner could not be resolved: ${plan.tokenOwner.lookupError}`,
  );
}

if (plan.missingKeepLogins.length > 0 && (confirmDeactivate || confirmDelete)) {
  writeJsonFile(outputsPath, plan);
  throw new Error(
    `Refusing to prune users because these keepLogins were not found: ${plan.missingKeepLogins.join(', ')}`,
  );
}

if (dryRun) {
  writeJsonFile(outputsPath, plan);
  console.log(`Prepared Okta user prune plan for "${environmentName}".`);
  console.log(`- Users retained: ${plan.retained.length}`);
  if (action === 'delete') {
    console.log(
      `- Users that would be deleted: ${plan.deletionCandidates.length}`,
    );
    console.log(
      `- Users that would be deactivated first: ${plan.deactivationCandidates.length}`,
    );
  } else {
    console.log(
      `- Users that would be deactivated: ${plan.deactivationCandidates.length}`,
    );
  }
  console.log(`- Users skipped: ${plan.skipped.length}`);
  console.log(`- Preview file: ${path.relative(repoRoot, outputsPath)}`);
  process.exit(0);
}

const results = {
  ...plan,
  deactivated: [],
  deleted: [],
};

if (confirmDelete) {
  for (const user of plan.deletionCandidates) {
    results.deleted.push(await deactivateAndDeleteUser(user));
  }
} else {
  for (const user of plan.deactivationCandidates) {
    results.deactivated.push(await deactivateUser(user));
  }
}

writeJsonFile(outputsPath, results);
console.log(`Pruned Okta users for "${environmentName}".`);
console.log(`- Users retained: ${results.retained.length}`);
if (confirmDelete) {
  console.log(`- Deleted users: ${results.deleted.length}`);
  console.log(
    `- Users deactivated before delete: ${results.deleted.filter((user) => user.operations.includes('deactivation-requested')).length}`,
  );
} else {
  console.log(`- Deactivation requests: ${results.deactivated.length}`);
}
console.log(`- Users skipped: ${results.skipped.length}`);
console.log(`- Report file: ${path.relative(repoRoot, outputsPath)}`);

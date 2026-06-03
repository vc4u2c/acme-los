import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const args = process.argv.slice(3);
const confirmDelete =
  hasFlag('--confirm-delete') || getNpmConfigBoolean('confirm-delete');
const includeAdmins =
  hasFlag('--include-admins') || getNpmConfigBoolean('include-admins');
const allowTokenOwner =
  hasFlag('--allow-token-owner') || getNpmConfigBoolean('allow-token-owner');
const dryRun =
  !confirmDelete || hasFlag('--dry-run') || getNpmConfigBoolean('dry-run');
const targetLogins = readTargetLogins(args);

if (!environmentName || targetLogins.length === 0) {
  console.error(
    'Usage: node tools/scripts/okta/delete-okta-users.mjs <dev|qa|stg|prod> --login <login> [--login <login> ...] [--dry-run] [--confirm-delete] [--include-admins] [--allow-token-owner]',
  );
  process.exit(1);
}

if (!process.env.OKTA_API_TOKEN?.trim()) {
  console.error('Set OKTA_API_TOKEN before deleting Okta users.');
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
  `${environmentName}.user-delete.outputs.json`,
);

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown Okta environment "${environmentName}".`);
  process.exit(1);
}

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const issuer = requiredString(environment.okta?.issuer, 'okta.issuer');
const oktaApiBaseUrl = new URL('/', issuer).toString().replace(/\/$/, '');
const token = process.env.OKTA_API_TOKEN?.trim();
const targetLoginSet = new Set(targetLogins.map(normalizeLogin));

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

function normalizeLogin(value) {
  return value.trim().toLowerCase();
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

function readTargetLogins(values) {
  const logins = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === '--login') {
      const login = optionalString(values[index + 1]);
      if (login) {
        logins.push(login);
      }
      index += 1;
      continue;
    }

    if (value.startsWith('--login=')) {
      const login = optionalString(value.slice('--login='.length));
      if (login) {
        logins.push(login);
      }
      continue;
    }

    if (value === '--logins') {
      const loginsValue = optionalString(values[index + 1]);
      if (loginsValue) {
        logins.push(...loginsValue.split(','));
      }
      index += 1;
      continue;
    }

    if (value.startsWith('--logins=')) {
      logins.push(...value.slice('--logins='.length).split(','));
    }
  }

  return [
    ...new Set(
      logins
        .map((value) => optionalString(value))
        .filter((value) => typeof value === 'string'),
    ),
  ];
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
    status: response.status,
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

function isNotFoundError(error) {
  return error instanceof Error && error.message.includes(' failed with 404:');
}

async function getUserByLogin(login) {
  try {
    const response = await oktaFetch(
      'GET',
      `/api/v1/users/${encodeURIComponent(login)}`,
    );
    return response.payload;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
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

function matchesTargetLogin(user) {
  return [user.profile?.login, user.profile?.email].some((value) => {
    const normalizedValue = optionalString(value);
    return normalizedValue
      ? targetLoginSet.has(normalizeLogin(normalizedValue))
      : false;
  });
}

function findMissingTargetLogins(users) {
  const matched = new Set(
    users.flatMap((user) =>
      [user.profile?.login, user.profile?.email]
        .map((value) => optionalString(value))
        .filter((value) => typeof value === 'string')
        .map(normalizeLogin),
    ),
  );

  return targetLogins.filter((login) => !matched.has(normalizeLogin(login)));
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
  const targetUserMap = new Map(
    users.filter(matchesTargetLogin).map((user) => [user.id, user]),
  );

  for (const login of targetLogins) {
    const user = await getUserByLogin(login);
    if (user && matchesTargetLogin(user)) {
      targetUserMap.set(user.id, user);
    }
  }

  const targetUsers = [...targetUserMap.values()];
  const missingTargetLogins = findMissingTargetLogins(targetUsers);
  const tokenOwnerId = currentUser?.id;
  const targets = [];
  const skipped = [];

  for (const user of targetUsers) {
    const roles = await listUserRoles(user.id);
    const roleLabels = roles.map((role) => role.label ?? role.type ?? role.id);
    const describedUser = {
      ...describeUser(user),
      roles: roleLabels,
      isTokenOwner: Boolean(tokenOwnerId && user.id === tokenOwnerId),
    };

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

    targets.push({
      ...describedUser,
      plannedAction:
        user.status === 'DEPROVISIONED' ? 'delete' : 'deactivate-and-delete',
    });
  }

  return {
    environment: environmentName,
    mode: dryRun ? 'dry-run' : 'confirm-delete',
    oktaApiBaseUrl,
    includeAdmins,
    allowTokenOwner,
    targetLogins,
    missingTargetLogins,
    tokenOwner: currentUser?.lookupError
      ? { lookupError: currentUser.lookupError }
      : describeUser(currentUser),
    targets,
    skipped,
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
writeJsonFile(outputsPath, plan);

if (plan.missingTargetLogins.length > 0 && confirmDelete) {
  throw new Error(
    `Refusing to delete users because these target logins were not found: ${plan.missingTargetLogins.join(', ')}`,
  );
}

if (plan.skipped.length > 0 && confirmDelete) {
  throw new Error(
    `Refusing to delete users because ${plan.skipped.length} target user(s) were skipped. Check ${path.relative(repoRoot, outputsPath)}.`,
  );
}

if (dryRun) {
  console.log(`Prepared Okta user delete plan for "${environmentName}".`);
  console.log(`- Target users: ${plan.targets.length}`);
  console.log(`- Missing target logins: ${plan.missingTargetLogins.length}`);
  console.log(`- Skipped target users: ${plan.skipped.length}`);
  console.log(`- Preview file: ${path.relative(repoRoot, outputsPath)}`);
  process.exit(0);
}

const results = {
  ...plan,
  deleted: [],
};

for (const user of plan.targets) {
  results.deleted.push(await deactivateAndDeleteUser(user));
}

writeJsonFile(outputsPath, results);
console.log(`Deleted Okta users for "${environmentName}".`);
console.log(`- Deleted users: ${results.deleted.length}`);
console.log(`- Missing target logins: ${results.missingTargetLogins.length}`);
console.log(`- Skipped target users: ${results.skipped.length}`);
console.log(`- Report file: ${path.relative(repoRoot, outputsPath)}`);

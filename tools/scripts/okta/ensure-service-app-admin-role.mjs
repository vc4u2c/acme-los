#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const allowedEnvironments = new Set(['dev', 'qa', 'stg', 'prod']);
const roleType = 'USER_ADMIN';

function usage() {
  console.error(
    [
      'Usage: node tools/scripts/okta/ensure-service-app-admin-role.mjs <dev|qa|stg|prod> [--confirm] [--token-file <path>] [--token-type api|bearer] [--client-id <id>] [--customer-group-id <id>]',
      '',
      'Defaults to dry-run. Assigns USER_ADMIN to the configured Okta service app and scopes it to acme-los-customers-<env>.',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const [environmentName, ...rest] = argv;
  const options = {
    environmentName,
    confirm: false,
    tokenFile: undefined,
    tokenType: undefined,
    clientId: undefined,
    customerGroupId: undefined,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === '--confirm') {
      options.confirm = true;
      continue;
    }

    if (value === '--token-file') {
      options.tokenFile = requiredNextValue(rest, index, '--token-file');
      index += 1;
      continue;
    }

    if (value.startsWith('--token-file=')) {
      options.tokenFile = requiredInlineValue(value, '--token-file');
      continue;
    }

    if (value === '--token-type') {
      options.tokenType = requiredNextValue(rest, index, '--token-type');
      index += 1;
      continue;
    }

    if (value.startsWith('--token-type=')) {
      options.tokenType = requiredInlineValue(value, '--token-type');
      continue;
    }

    if (value === '--client-id') {
      options.clientId = requiredNextValue(rest, index, '--client-id');
      index += 1;
      continue;
    }

    if (value.startsWith('--client-id=')) {
      options.clientId = requiredInlineValue(value, '--client-id');
      continue;
    }

    if (value === '--customer-group-id') {
      options.customerGroupId = requiredNextValue(
        rest,
        index,
        '--customer-group-id',
      );
      index += 1;
      continue;
    }

    if (value.startsWith('--customer-group-id=')) {
      options.customerGroupId = requiredInlineValue(
        value,
        '--customer-group-id',
      );
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  if (!allowedEnvironments.has(options.environmentName)) {
    throw new Error('Environment name must be one of dev, qa, stg, or prod.');
  }

  if (
    options.tokenType &&
    !['api', 'bearer'].includes(options.tokenType.toLowerCase())
  ) {
    throw new Error('--token-type must be api or bearer.');
  }

  return options;
}

function requiredNextValue(values, index, optionName) {
  const value = values[index + 1]?.trim();
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function requiredInlineValue(value, optionName) {
  const inlineValue = value.slice(`${optionName}=`.length).trim();
  if (!inlineValue) {
    throw new Error(`${optionName} requires a value.`);
  }

  return inlineValue;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function requiredString(value, label) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`${label} is required.`);
  }

  return text;
}

function readToken(options) {
  const bearerToken = process.env.OKTA_MANAGEMENT_ACCESS_TOKEN?.trim();
  if (bearerToken) {
    return { value: bearerToken, scheme: 'Bearer', source: 'env:bearer' };
  }

  const apiToken = process.env.OKTA_API_TOKEN?.trim();
  if (apiToken) {
    return { value: apiToken, scheme: 'SSWS', source: 'env:api' };
  }

  if (options.tokenFile) {
    const value = fs.readFileSync(options.tokenFile, 'utf8').trim();
    if (!value) {
      throw new Error(`Token file "${options.tokenFile}" was empty.`);
    }

    if (options.tokenType?.toLowerCase() === 'bearer') {
      return { value, scheme: 'Bearer', source: 'file:bearer' };
    }

    return { value, scheme: 'SSWS', source: 'file:api' };
  }

  throw new Error(
    'Set OKTA_MANAGEMENT_ACCESS_TOKEN, OKTA_API_TOKEN, or pass --token-file.',
  );
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

async function oktaRequest({
  apiBaseUrl,
  token,
  method = 'GET',
  pathName,
  body,
  expectedStatuses = [200, 201, 204],
}) {
  const url = new URL(pathName, apiBaseUrl);
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `${token.scheme} ${token.value}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `Okta API ${method} ${url.pathname} failed (${response.status}): ${text}`,
    );
  }

  if (!text || response.status === 204) {
    return { value: null, headers: response.headers };
  }

  return { value: JSON.parse(text), headers: response.headers };
}

async function listAll({ apiBaseUrl, token, pathName, limit = 200 }) {
  const items = [];
  let nextUrl = new URL(pathName, apiBaseUrl);

  if (!nextUrl.searchParams.has('limit')) {
    nextUrl.searchParams.set('limit', `${limit}`);
  }

  for (let page = 0; page < 25 && nextUrl; page += 1) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `${token.scheme} ${token.value}`,
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Okta API GET ${nextUrl.pathname} failed (${response.status}): ${text}`,
      );
    }

    const pageItems = text ? JSON.parse(text) : [];
    items.push(...(Array.isArray(pageItems) ? pageItems : [pageItems]));

    const links = parseLinkHeader(response.headers.get('link'));
    nextUrl = links.next ? new URL(links.next) : null;
  }

  return items;
}

async function findGroupByName({ apiBaseUrl, token, groupName }) {
  const groups = await listAll({
    apiBaseUrl,
    token,
    pathName: `/api/v1/groups?q=${encodeURIComponent(groupName)}`,
  });

  return groups.find((group) => group.profile?.name === groupName);
}

async function getGroup({ apiBaseUrl, token, groupId }) {
  const { value } = await oktaRequest({
    apiBaseUrl,
    token,
    pathName: `/api/v1/groups/${encodeURIComponent(groupId)}`,
  });

  return value;
}

async function listClientRoles({ apiBaseUrl, token, clientId }) {
  return listAll({
    apiBaseUrl,
    token,
    pathName: `/oauth2/v1/clients/${encodeURIComponent(clientId)}/roles`,
  });
}

async function assignClientRole({ apiBaseUrl, token, clientId }) {
  const { value } = await oktaRequest({
    apiBaseUrl,
    token,
    method: 'POST',
    pathName: `/oauth2/v1/clients/${encodeURIComponent(clientId)}/roles`,
    body: { type: roleType },
  });

  return value;
}

async function listClientRoleGroupTargets({
  apiBaseUrl,
  token,
  clientId,
  roleAssignmentId,
}) {
  return listAll({
    apiBaseUrl,
    token,
    pathName: `/oauth2/v1/clients/${encodeURIComponent(clientId)}/roles/${encodeURIComponent(roleAssignmentId)}/targets/groups`,
  });
}

async function assignClientRoleGroupTarget({
  apiBaseUrl,
  token,
  clientId,
  roleAssignmentId,
  groupId,
}) {
  const { value } = await oktaRequest({
    apiBaseUrl,
    token,
    method: 'PUT',
    pathName: `/oauth2/v1/clients/${encodeURIComponent(clientId)}/roles/${encodeURIComponent(roleAssignmentId)}/targets/groups/${encodeURIComponent(groupId)}`,
  });

  return value;
}

function targetMatchesGroup(target, groupId) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  return JSON.stringify(target).includes(groupId);
}

function resolveConfiguredClientId({ options, platform, environmentName }) {
  const platformEnvironment = platform.environments?.[environmentName];
  const oktaWriteback = platformEnvironment?.oktaCustomerIdWriteback ?? {};
  const oktaProfileSync = platformEnvironment?.oktaAccountProfileSync ?? {};

  return requiredString(
    options.clientId ?? oktaProfileSync.clientId ?? oktaWriteback.clientId,
    'Okta management service app client id',
  );
}

function readBootstrapCustomerGroupId(environmentName) {
  const bootstrapOutputsPath = path.join(
    repoRoot,
    'tmp',
    'okta',
    `${environmentName}.bootstrap.outputs.json`,
  );

  if (!fs.existsSync(bootstrapOutputsPath)) {
    return undefined;
  }

  return optionalString(readJsonFile(bootstrapOutputsPath).customerGroupId);
}

async function resolveCustomerGroup({
  apiBaseUrl,
  token,
  options,
  environmentName,
}) {
  const expectedGroupName = `acme-los-customers-${environmentName}`;
  const groupId =
    options.customerGroupId ?? readBootstrapCustomerGroupId(environmentName);

  if (groupId) {
    const group = await getGroup({ apiBaseUrl, token, groupId });
    const actualGroupName = group?.profile?.name;

    if (actualGroupName !== expectedGroupName) {
      throw new Error(
        `Refusing to target group ${groupId}; expected ${expectedGroupName}, got ${actualGroupName ?? 'missing'}.`,
      );
    }

    return group;
  }

  const group = await findGroupByName({
    apiBaseUrl,
    token,
    groupName: expectedGroupName,
  });

  if (!group) {
    throw new Error(`Customer group ${expectedGroupName} was not found.`);
  }

  return group;
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage();
    throw error;
  }

  const environmentPath = path.join(
    repoRoot,
    'infra',
    'okta',
    'environments',
    `${options.environmentName}.json`,
  );
  const platformPath = path.join(
    repoRoot,
    'infra',
    'azure',
    'config',
    'platform.json',
  );
  const outputsPath = path.join(
    repoRoot,
    'tmp',
    'okta',
    `${options.environmentName}.service-app-role.outputs.json`,
  );

  const environment = readJsonFile(environmentPath);
  const platform = readJsonFile(platformPath);
  const apiBaseUrl = requiredString(
    environment.okta?.orgUrl ?? new URL(environment.okta?.issuer).origin,
    'Okta org URL',
  ).replace(/\/$/, '');
  const clientId = resolveConfiguredClientId({
    options,
    platform,
    environmentName: options.environmentName,
  });
  const token = readToken(options);
  const customerGroup = await resolveCustomerGroup({
    apiBaseUrl,
    token,
    options,
    environmentName: options.environmentName,
  });
  const rolesBefore = await listClientRoles({ apiBaseUrl, token, clientId });
  let roleAssignment = rolesBefore.find((role) => role.type === roleType);
  const changes = [];

  if (!roleAssignment) {
    changes.push({
      action: 'assign-client-role',
      status: options.confirm ? 'pending' : 'would-apply',
      roleType,
    });

    if (options.confirm) {
      roleAssignment = await assignClientRole({ apiBaseUrl, token, clientId });
      changes[changes.length - 1].status = 'applied';
      changes[changes.length - 1].roleAssignmentId = roleAssignment.id;
    }
  }

  let targetsBefore = [];
  let targetAlreadyPresent = false;

  if (roleAssignment) {
    targetsBefore = await listClientRoleGroupTargets({
      apiBaseUrl,
      token,
      clientId,
      roleAssignmentId: roleAssignment.id,
    });
    targetAlreadyPresent = targetsBefore.some((target) =>
      targetMatchesGroup(target, customerGroup.id),
    );
  }

  if (!targetAlreadyPresent) {
    changes.push({
      action: 'assign-client-role-group-target',
      status: options.confirm ? 'pending' : 'would-apply',
      roleAssignmentId: roleAssignment?.id ?? '<created during apply>',
      groupId: customerGroup.id,
    });

    if (options.confirm) {
      if (!roleAssignment?.id) {
        throw new Error('Role assignment was not available after role apply.');
      }

      await assignClientRoleGroupTarget({
        apiBaseUrl,
        token,
        clientId,
        roleAssignmentId: roleAssignment.id,
        groupId: customerGroup.id,
      });
      changes[changes.length - 1].status = 'applied';
    }
  }

  const targetsAfter = roleAssignment
    ? await listClientRoleGroupTargets({
        apiBaseUrl,
        token,
        clientId,
        roleAssignmentId: roleAssignment.id,
      })
    : [];
  const targetPresentAfter = targetsAfter.some((target) =>
    targetMatchesGroup(target, customerGroup.id),
  );

  if (options.confirm && !targetPresentAfter) {
    throw new Error(
      `Okta did not report ${customerGroup.profile.name} as a USER_ADMIN target after apply.`,
    );
  }

  const result = {
    environment: options.environmentName,
    mode: options.confirm ? 'applied' : 'dry-run',
    apiBaseUrl,
    clientId,
    roleType,
    roleAssignmentId: roleAssignment?.id ?? '',
    customerGroup: {
      id: customerGroup.id,
      name: customerGroup.profile?.name,
    },
    tokenSource: token.source,
    targetPresentBefore: targetAlreadyPresent,
    targetPresentAfter,
    changes,
  };

  writeJsonFile(outputsPath, result);

  console.log(
    `${options.confirm ? 'Applied' : 'Dry run for'} ${roleType} service-app role target.`,
  );
  console.log(`- Client: ${clientId}`);
  console.log(
    `- Target group: ${customerGroup.profile?.name} (${customerGroup.id})`,
  );

  if (changes.length === 0) {
    console.log('- No changes needed.');
  } else {
    for (const change of changes) {
      console.log(`- ${change.status}: ${change.action}`);
    }
  }

  if (!options.confirm && changes.length > 0) {
    console.log('No changes made. Re-run with --confirm to update Okta.');
  }
}

await main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

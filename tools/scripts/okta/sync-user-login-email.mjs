#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
} from 'node:crypto';
import { importJWK, SignJWT } from 'jose';

const repoRoot = process.cwd();
const clientAssertionType =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

function usage() {
  console.error(
    [
      'Usage: node tools/scripts/okta/sync-user-login-email.mjs <dev|qa|stg|prod> [--all-customers | --user-id <id>] [--confirm] [--private-key-pem-path <path>]',
      '',
      'Defaults to dry-run. Uses the Okta service app configured in infra/azure/config/platform.json and only updates ACME customer-group users. If the service app lacks group-read scope, pass audited user IDs from tmp/okta/<env>.live-okta-audit.json.',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const [environmentName, ...rest] = argv;
  const options = {
    environmentName,
    allCustomers: false,
    confirm: false,
    auditReportPath: undefined,
    userIds: [],
    privateKeyPemPath: undefined,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === '--all-customers') {
      options.allCustomers = true;
      continue;
    }

    if (value === '--confirm') {
      options.confirm = true;
      continue;
    }

    if (value === '--user-id') {
      const userId = rest[index + 1]?.trim();
      if (!userId) {
        throw new Error('--user-id requires a value.');
      }

      options.userIds.push(userId);
      index += 1;
      continue;
    }

    if (value.startsWith('--user-id=')) {
      const userId = value.slice('--user-id='.length).trim();
      if (!userId) {
        throw new Error('--user-id requires a value.');
      }

      options.userIds.push(userId);
      continue;
    }

    if (value === '--private-key-pem-path') {
      options.privateKeyPemPath = rest[index + 1]?.trim();
      if (!options.privateKeyPemPath) {
        throw new Error('--private-key-pem-path requires a value.');
      }

      index += 1;
      continue;
    }

    if (value === '--audit-report') {
      options.auditReportPath = rest[index + 1]?.trim();
      if (!options.auditReportPath) {
        throw new Error('--audit-report requires a value.');
      }

      index += 1;
      continue;
    }

    if (value.startsWith('--audit-report=')) {
      options.auditReportPath = value.slice('--audit-report='.length).trim();
      if (!options.auditReportPath) {
        throw new Error('--audit-report requires a value.');
      }

      continue;
    }

    if (value.startsWith('--private-key-pem-path=')) {
      options.privateKeyPemPath = value
        .slice('--private-key-pem-path='.length)
        .trim();
      if (!options.privateKeyPemPath) {
        throw new Error('--private-key-pem-path requires a value.');
      }

      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  if (!options.environmentName) {
    throw new Error('Environment name is required.');
  }

  if (options.allCustomers && options.userIds.length > 0) {
    throw new Error('Use either --all-customers or --user-id, not both.');
  }

  if (!options.allCustomers && options.userIds.length === 0) {
    throw new Error('Use --all-customers or at least one --user-id.');
  }

  return options;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return value;
  }

  const [local, domain] = value.split('@');
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
}

function normalizeEmailOrLogin(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readPrivateKeyPem(options) {
  const envValue = optionalString(
    process.env.ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM,
  );
  if (envValue) {
    return envValue.includes('\\n')
      ? envValue.replaceAll('\\n', '\n')
      : envValue;
  }

  if (options.privateKeyPemPath) {
    return fs.readFileSync(options.privateKeyPemPath, 'utf8');
  }

  throw new Error(
    'Set ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM or pass --private-key-pem-path.',
  );
}

async function loadSigningKey(privateKeyValue, privateKeyId) {
  const trimmedPrivateKey = privateKeyValue.trim();

  if (trimmedPrivateKey.startsWith('{')) {
    const jwk = JSON.parse(trimmedPrivateKey);

    return {
      key: await importJWK(jwk, 'RS256'),
      publicJwk: buildPublicJwk(jwk, privateKeyId),
    };
  }

  const key = createPrivateKey(privateKeyValue);
  const exportedPublicJwk = createPublicKey(key).export({ format: 'jwk' });

  return {
    key,
    publicJwk: buildPublicJwk(exportedPublicJwk, privateKeyId),
  };
}

function buildPublicJwk(jwk, privateKeyId) {
  return {
    kty: jwk.kty,
    e: jwk.e,
    n: jwk.n,
    ...((privateKeyId ?? jwk.kid) ? { kid: privateKeyId ?? jwk.kid } : {}),
    alg: 'RS256',
    use: 'sig',
  };
}

function accessTokenHash(accessToken) {
  return createHash('sha256').update(accessToken).digest('base64url');
}

function dpopHtu(url) {
  return `${url.origin}${url.pathname}`;
}

async function createDpopProof({
  key,
  publicJwk,
  method,
  url,
  accessToken,
  nonce,
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    htm: method.toUpperCase(),
    htu: dpopHtu(url),
    iat: now,
    jti: randomUUID().replaceAll('-', ''),
    ...(accessToken ? { ath: accessTokenHash(accessToken) } : {}),
    ...(nonce ? { nonce } : {}),
  };

  return await new SignJWT(payload)
    .setProtectedHeader({
      typ: 'dpop+jwt',
      alg: 'RS256',
      jwk: publicJwk,
    })
    .sign(key);
}

async function oktaRequest({
  apiBaseUrl,
  auth,
  dpop,
  method = 'GET',
  pathName,
  body,
}) {
  const url = new URL(pathName, apiBaseUrl);
  const usesDpop = auth.tokenType.toLowerCase() === 'dpop';
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `${usesDpop ? 'DPoP' : 'Bearer'} ${auth.accessToken}`,
      ...(usesDpop
        ? {
            DPoP: await createDpopProof({
              ...dpop,
              method,
              url,
              accessToken: auth.accessToken,
            }),
          }
        : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Okta API ${method} ${pathName} failed (${response.status}): ${text}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

async function listAll({ apiBaseUrl, auth, dpop, pathName }) {
  const items = [];
  let nextUrl = new URL(pathName, apiBaseUrl);
  nextUrl.searchParams.set('limit', '200');

  for (let page = 0; page < 25 && nextUrl; page += 1) {
    const usesDpop = auth.tokenType.toLowerCase() === 'dpop';
    const response = await fetch(nextUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `${usesDpop ? 'DPoP' : 'Bearer'} ${auth.accessToken}`,
        ...(usesDpop
          ? {
              DPoP: await createDpopProof({
                ...dpop,
                method: 'GET',
                url: nextUrl,
                accessToken: auth.accessToken,
              }),
            }
          : {}),
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Okta API GET ${nextUrl.pathname} failed (${response.status}): ${text}`,
      );
    }

    const pageItems = text ? JSON.parse(text) : [];
    items.push(...pageItems);

    const linkHeader = response.headers.get('link') ?? '';
    const nextLink = linkHeader
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.includes('rel="next"'));
    const href = nextLink?.match(/<([^>]+)>/)?.[1];
    nextUrl = href ? new URL(href) : null;
  }

  return items;
}

async function requestManagementToken({
  apiBaseUrl,
  clientId,
  privateKeyId,
  key,
  publicJwk,
  scopes,
}) {
  const tokenEndpoint = new URL('/oauth2/v1/token', apiBaseUrl).toString();
  const tokenEndpointUrl = new URL(tokenEndpoint);
  const createClientAssertion = async () => {
    const now = Math.floor(Date.now() / 1000);

    return await new SignJWT({
      sub: clientId,
      jti: randomUUID().replaceAll('-', ''),
    })
      .setProtectedHeader({
        alg: 'RS256',
        ...(privateKeyId ? { kid: privateKeyId } : {}),
      })
      .setIssuer(clientId)
      .setAudience(tokenEndpoint)
      .setIssuedAt(now)
      .setNotBefore(now - 60)
      .setExpirationTime(now + 300)
      .sign(key);
  };
  const sendTokenRequest = async (nonce) => {
    const requestBody = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopes,
      client_assertion_type: clientAssertionType,
      client_assertion: await createClientAssertion(),
    });

    return await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        DPoP: await createDpopProof({
          key,
          publicJwk,
          method: 'POST',
          url: tokenEndpointUrl,
          nonce,
        }),
      },
      body: requestBody,
    });
  };
  let response = await sendTokenRequest();

  if (!response.ok && response.headers.get('dpop-nonce')) {
    response = await sendTokenRequest(response.headers.get('dpop-nonce'));
  }

  const payload = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    !['bearer', 'dpop'].includes(payload.token_type?.toLowerCase())
  ) {
    const summary =
      payload.error_description ?? payload.errorSummary ?? payload.error ?? '';
    throw new Error(
      `Okta management token request failed (${response.status}). ${summary}`,
    );
  }

  return {
    accessToken: requiredString(
      payload.access_token,
      'Okta management access token',
    ),
    tokenType: requiredString(payload.token_type, 'Okta management token type'),
  };
}

async function findGroupByName({ apiBaseUrl, auth, dpop, groupName }) {
  const groups = await listAll({
    apiBaseUrl,
    auth,
    dpop,
    pathName: `/api/v1/groups?q=${encodeURIComponent(groupName)}`,
  });

  return groups.find((group) => group.profile?.name === groupName);
}

function readAuditedCustomerUserIds(options) {
  const auditReportPath =
    options.auditReportPath ??
    path.join(
      repoRoot,
      'tmp',
      'okta',
      `${options.environmentName}.live-okta-audit.json`,
    );

  if (!fs.existsSync(auditReportPath)) {
    throw new Error(
      `Customer group lookup was not authorized and audit report ${auditReportPath} was not found.`,
    );
  }

  const auditReport = readJsonFile(auditReportPath);
  const customerGroup = auditReport.live?.customerGroup;
  const users = [
    ...(customerGroup?.sampleUsers ?? []),
    ...(customerGroup?.emailLoginMismatchSamples ?? []),
  ];

  return new Set(
    users
      .map((user) => optionalString(user.id))
      .filter((userId) => userId !== undefined),
  );
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
  const environment = readJsonFile(environmentPath);
  const platform = readJsonFile(platformPath);
  const platformEnvironment = platform.environments?.[options.environmentName];
  const oktaWriteback = platformEnvironment?.oktaCustomerIdWriteback ?? {};
  const oktaProfileSync = platformEnvironment?.oktaAccountProfileSync ?? {};
  const apiBaseUrl = requiredString(
    environment.okta?.orgUrl ?? new URL(environment.okta?.issuer).origin,
    'Okta org URL',
  ).replace(/\/$/, '');
  const clientId = requiredString(
    oktaProfileSync.clientId ?? oktaWriteback.clientId,
    'Okta management client id',
  );
  const privateKeyId = optionalString(
    oktaProfileSync.privateKeyId ?? oktaWriteback.privateKeyId,
  );
  const scopes = requiredString(
    oktaProfileSync.scopes ??
      oktaWriteback.scopes ??
      'okta.users.read okta.users.manage',
    'Okta management scopes',
  );

  const scopeSet = new Set(scopes.split(/[\s,;]+/).filter(Boolean));
  if (!scopeSet.has('okta.users.read') || !scopeSet.has('okta.users.manage')) {
    throw new Error(
      'Okta management scopes must include okta.users.read and okta.users.manage.',
    );
  }

  const privateKeyPem = readPrivateKeyPem(options);
  const signingKey = await loadSigningKey(privateKeyPem, privateKeyId);
  const dpop = {
    key: signingKey.key,
    publicJwk: signingKey.publicJwk,
  };
  const auth = await requestManagementToken({
    apiBaseUrl,
    clientId,
    privateKeyId,
    key: signingKey.key,
    publicJwk: signingKey.publicJwk,
    scopes,
  });
  let selectedUsers;

  try {
    const customerGroupName = `acme-los-customers-${options.environmentName}`;
    const customerGroup = await findGroupByName({
      apiBaseUrl,
      auth,
      dpop,
      groupName: customerGroupName,
    });

    if (!customerGroup) {
      throw new Error(`Customer group ${customerGroupName} was not found.`);
    }

    const customerUsers = await listAll({
      apiBaseUrl,
      auth,
      dpop,
      pathName: `/api/v1/groups/${customerGroup.id}/users`,
    });
    const customerUserIds = new Set(customerUsers.map((user) => user.id));

    selectedUsers = options.allCustomers
      ? customerUsers
      : await Promise.all(
          options.userIds.map(async (userId) => {
            if (!customerUserIds.has(userId)) {
              throw new Error(
                `Refusing to update non-customer-group user ${userId}.`,
              );
            }

            return await oktaRequest({
              apiBaseUrl,
              auth,
              dpop,
              pathName: `/api/v1/users/${encodeURIComponent(userId)}`,
            });
          }),
        );
  } catch (error) {
    if (options.allCustomers || !error.message.includes('(403)')) {
      throw error;
    }

    const auditedCustomerUserIds = readAuditedCustomerUserIds(options);

    selectedUsers = await Promise.all(
      options.userIds.map(async (userId) => {
        if (!auditedCustomerUserIds.has(userId)) {
          throw new Error(
            `Refusing to update user ${userId}; it was not found in the latest live-audit customer group report.`,
          );
        }

        return await oktaRequest({
          apiBaseUrl,
          auth,
          dpop,
          pathName: `/api/v1/users/${encodeURIComponent(userId)}`,
        });
      }),
    );
  }
  const candidates = selectedUsers.filter((user) => {
    const login = normalizeEmailOrLogin(user.profile?.login);
    const email = normalizeEmailOrLogin(user.profile?.email);

    return login.length > 0 && email.length > 0 && login !== email;
  });

  console.log(
    `${options.confirm ? 'Confirming' : 'Dry run'} login/email sync for ${candidates.length} customer user(s).`,
  );

  for (const user of candidates) {
    console.log(
      `- ${user.id}: ${maskEmail(user.profile?.login)} -> ${maskEmail(user.profile?.email)}`,
    );

    if (!options.confirm) {
      continue;
    }

    await oktaRequest({
      apiBaseUrl,
      auth,
      dpop,
      method: 'POST',
      pathName: `/api/v1/users/${encodeURIComponent(user.id)}`,
      body: {
        profile: {
          email: user.profile.email,
          login: user.profile.email,
        },
      },
    });
  }

  if (!options.confirm && candidates.length > 0) {
    console.log('No changes made. Re-run with --confirm to update Okta.');
  }
}

await main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

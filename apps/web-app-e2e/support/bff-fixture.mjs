import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const host = process.env.HOSTNAME || '127.0.0.1';
const port = Number(process.env.PORT || '7206');
const authCookieName = 'acme-los-e2e-auth';
const applicationSteps = new Map();

function parseCookies(request) {
  return new Map(
    String(request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return separator < 0
          ? [part, '']
          : [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

function readUser(request) {
  const value = parseCookies(request).get(authCookieName);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function assuranceLevel(user) {
  const methods = (user?.authenticationMethods || []).map((method) =>
    String(method).toLowerCase(),
  );
  return methods.length > 1 ||
    methods.some((method) =>
      ['email', 'sms', 'phone', 'otp', 'mfa', 'totp'].includes(method),
    )
    ? 'aal2'
    : methods.length > 0
      ? 'aal1'
      : 'anonymous';
}

function buildSession(request) {
  const user = readUser(request);
  return user
    ? {
        provider: 'okta',
        status: 'authenticated',
        isAuthenticated: true,
        assuranceLevel: assuranceLevel(user),
        user,
      }
    : {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      };
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const value = Buffer.concat(chunks).toString('utf8');
  return value ? JSON.parse(value) : {};
}

function isRequirementSatisfied(session, requirement) {
  if (requirement.requiresAuthentication === false) {
    return true;
  }
  if (!session.isAuthenticated) {
    return false;
  }
  if (
    requirement.minimumAssuranceLevel === 'aal2' &&
    session.assuranceLevel !== 'aal2'
  ) {
    return false;
  }
  return !requirement.requiredStepUp || session.assuranceLevel === 'aal2';
}

function getIdentity(request) {
  const user = readUser(request);
  return {
    id: request.headers['x-acme-authenticated-user-id'] || user?.id,
    email: request.headers['x-acme-authenticated-user-email'] || user?.email,
    customerId:
      request.headers['x-acme-authenticated-customer-id'] || user?.customerId,
    leadId: request.headers['x-acme-authenticated-lead-id'] || user?.leadId,
  };
}

function buildSummary(identity, step, completedSteps = []) {
  return {
    currentStep: step,
    customerId: identity.customerId || null,
    leadId: identity.leadId || null,
    completedSteps,
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  const session = buildSession(request);

  if (url.pathname === '/' || url.pathname === '/bff/health') {
    json(response, 200, { status: 'ok', fixture: 'web-app-e2e-bff' });
    return;
  }

  if (url.pathname === '/bff/auth/session' && request.method === 'GET') {
    json(response, 200, { session });
    return;
  }

  if (
    url.pathname === '/bff/auth/session/requirement' &&
    request.method === 'POST'
  ) {
    const requirement = await readJson(request);
    const satisfied = isRequirementSatisfied(session, requirement);
    json(response, 200, {
      session,
      satisfied,
      ...(satisfied
        ? {}
        : { errorMessage: 'Authentication is required for this request.' }),
    });
    return;
  }

  if (url.pathname === '/bff/auth/session/touch' && request.method === 'POST') {
    json(
      response,
      session.isAuthenticated ? 200 : 401,
      { session, touched: session.isAuthenticated },
      session.isAuthenticated
        ? {
            'x-acme-auth-session-id': 'e2e-session',
            'x-acme-auth-session-max-age': '3600',
          }
        : {},
    );
    return;
  }

  if (url.pathname === '/bff/auth/session' && request.method === 'DELETE') {
    json(response, 200, {
      session: {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      },
      cleared: true,
    });
    return;
  }

  if (url.pathname === '/bff/auth/logout' && request.method === 'POST') {
    const payload = await readJson(request);
    json(response, 200, {
      session,
      cleared: true,
      logoutUrl: payload.postLogoutRedirectUri || '/',
      usedOktaLogout: false,
    });
    return;
  }

  if (url.pathname === '/bff/auth/idx/start' && request.method === 'POST') {
    const payload = await readJson(request);
    json(response, 200, {
      issuer: `http://${host}:${port}/oauth2/default`,
      clientId: 'e2e-client',
      redirectUri: 'http://127.0.0.1:4200/account/sign-in',
      scopes: ['openid', 'profile', 'email'],
      state: 'e2e-state',
      nonce: 'e2e-nonce',
      codeChallenge: 'e2e-code-challenge',
      codeChallengeMethod: 'S256',
      acrValues: null,
      maxAgeSeconds: null,
      transactionId: 'e2e-transaction',
      maxAge: 600,
      returnTo: payload.returnTo || '/apply/personal-info',
      stepUpReason: payload.stepUp?.reason || null,
    });
    return;
  }

  if (url.pathname === '/bff/security/csrf' && request.method === 'GET') {
    const token = randomBytes(24).toString('base64url');
    json(
      response,
      200,
      { csrfToken: token },
      {
        'set-cookie': `acme-los.csrf-token=${token}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
    return;
  }

  if (url.pathname === '/bff/security/inspector') {
    const now = Math.floor(Date.now() / 1000);
    json(response, 200, {
      provider: 'okta',
      stateStoreMode: 'in-memory',
      generatedAt: new Date().toISOString(),
      requestCookies: [...parseCookies(request)].map(([key, value]) => ({
        key,
        value,
      })),
      decodedCookies: { authSession: null, authTransaction: null },
      storedSession: session.isAuthenticated
        ? {
            sessionId: 'e2e-session',
            createdAt: now,
            expiresAt: now + 3600,
            lastActivityAt: now,
            idleExpiresAt: now + 900,
            session,
            tokens: {
              idToken: { raw: null, claims: null },
              accessToken: { raw: null, claims: null },
              refreshToken: null,
              tokenType: 'Bearer',
              scope: 'openid profile email',
            },
          }
        : null,
    });
    return;
  }

  if (url.pathname === '/bff/customer/profile' && request.method === 'GET') {
    const identity = getIdentity(request);
    json(response, 200, {
      profile: {
        email: identity.email || '',
        phone: '+12145550186',
        streetAddress: '1201 Commerce Row',
        addressLine2: 'Suite 400',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
      },
    });
    return;
  }

  const applicationStepMatch = url.pathname.match(
    /^\/bff\/application\/steps\/([^/]+)$/,
  );
  if (applicationStepMatch) {
    const step = applicationStepMatch[1];
    const identity = getIdentity(request);
    const key = `${identity.id || 'anonymous'}:${step}`;

    if (request.method === 'GET') {
      json(response, 200, { stepState: applicationSteps.get(key) || null });
      return;
    }

    if (request.method === 'PUT') {
      const payload = await readJson(request);
      const stepState = {
        step,
        payload: payload.payload || {},
        summary: buildSummary(identity, step, [step]),
      };
      applicationSteps.set(key, stepState);
      json(response, 200, { stepState });
      return;
    }
  }

  if (url.pathname === '/bff/application/submit' && request.method === 'POST') {
    const payload = await readJson(request);
    const identity = getIdentity(request);
    applicationSteps.clear();
    json(response, 200, {
      summary: buildSummary(identity, payload.step, [
        'personal-info',
        payload.step,
      ]),
    });
    return;
  }

  json(response, 404, { error: `No E2E BFF fixture for ${url.pathname}.` });
});

server.listen(port, host);

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import type {
  GetWebAuthSessionResponse,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  WebAuthSession,
  WebAuthSessionUser,
} from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { clearApplicationFlow } from './application-flow';
import { getAssuranceLevelFromAuthenticationMethods } from './assurance';
import {
  APPLICATION_FLOW_COOKIE_NAME,
  AUTH_SESSION_COOKIE_NAME,
  AUTH_TRANSACTION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CUSTOMER_PROFILE_COOKIE_NAME,
  clearCookie,
  parseSignedCookieValue,
  setSignedCookie,
} from './cookies';
import { verifyOktaIdToken } from './okta-id-token';
import {
  clearStoredWebAuthSession,
  createStoredWebAuthSession,
  readStoredWebAuthSession,
  type StoredWebAuthTokenSet,
} from './session-store';

const LEGACY_AUTH_LOGOUT_HINT_COOKIE_NAME = 'acme-los.auth-logout';

export type SessionCookiePayload = {
  sessionId: string;
};

export type SyncedWebAuthSession = {
  storedSessionId: string;
  maxAge: number;
  response: SyncWebAuthSessionResponse;
};

type ResolvedStoredSession = {
  sessionId: string;
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
};

function buildUnauthenticatedSession(errorMessage?: string): WebAuthSession {
  return {
    provider: 'okta',
    status: errorMessage ? 'error' : 'unauthenticated',
    isAuthenticated: false,
    assuranceLevel: 'anonymous',
    user: null,
    errorMessage,
  };
}

function buildAuthUserFromClaims(
  claims: Record<string, unknown>,
  fallbackLeadId?: string,
): WebAuthSessionUser | null {
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const claimedName = typeof claims.name === 'string' ? claims.name.trim() : '';
  const [derivedFirstName, ...derivedLastNameParts] = claimedName
    .split(/\s+/)
    .filter(Boolean);
  const derivedLastName =
    derivedLastNameParts.length > 0
      ? derivedLastNameParts.join(' ')
      : undefined;
  const firstName =
    (typeof claims.given_name === 'string' && claims.given_name.trim()) ||
    derivedFirstName ||
    undefined;
  const lastName =
    (typeof claims.family_name === 'string' && claims.family_name.trim()) ||
    derivedLastName ||
    undefined;
  const leadId =
    (typeof claims.lead_id === 'string' && claims.lead_id) ||
    (typeof claims.leadId === 'string' && claims.leadId) ||
    fallbackLeadId ||
    undefined;
  const customerId =
    (typeof claims.customer_id === 'string' && claims.customer_id) ||
    (typeof claims.customerId === 'string' && claims.customerId) ||
    undefined;
  const displayName =
    claimedName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email ||
    'Customer';
  const id =
    (typeof claims.sub === 'string' && claims.sub) || email || 'okta-user';

  return {
    id,
    email,
    displayName,
    firstName,
    lastName,
    leadId,
    customerId,
    authenticationMethods: Array.isArray(claims.amr)
      ? claims.amr.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

function buildAuthenticatedSession(
  claims: Record<string, unknown>,
  fallbackLeadId?: string,
): WebAuthSession {
  const user = buildAuthUserFromClaims(claims, fallbackLeadId);
  if (!user) {
    return buildUnauthenticatedSession();
  }

  return {
    provider: 'okta',
    status: 'authenticated',
    isAuthenticated: true,
    assuranceLevel: getAssuranceLevelFromAuthenticationMethods(
      user.authenticationMethods,
    ),
    user,
  };
}

async function readStoredSessionFromRequest(
  request: NextRequest,
): Promise<ResolvedStoredSession | null> {
  const sessionCookiePayload = readSessionCookiePayload(
    request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value,
  );

  if (!sessionCookiePayload) {
    return null;
  }

  const storedSession = await readStoredWebAuthSession(
    sessionCookiePayload.sessionId,
  );

  if (!storedSession) {
    return null;
  }

  return {
    sessionId: storedSession.sessionId,
    session: storedSession.session,
    tokens: storedSession.tokens,
  };
}

export async function readWebAuthSession(
  request: NextRequest,
  options: { includeDebug?: boolean } = {},
): Promise<GetWebAuthSessionResponse> {
  const storedSession = await readStoredSessionFromRequest(request);

  if (storedSession === null) {
    return {
      session: buildUnauthenticatedSession(),
      ...(options.includeDebug
        ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
        : {}),
    };
  }

  return {
    session: storedSession.session,
    ...(options.includeDebug
      ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
      : {}),
  };
}

export function readSessionCookiePayload(
  rawCookieValue?: string,
): SessionCookiePayload | null {
  return parseSignedCookieValue<SessionCookiePayload>(rawCookieValue);
}

export async function syncWebAuthSession(
  payload: SyncWebAuthSessionRequest,
  options: {
    expectedNonce?: string;
    serverTokens?: Omit<StoredWebAuthTokenSet, 'idToken'>;
  } = {},
): Promise<SyncedWebAuthSession> {
  const verifiedIdTokenClaims = await verifyOktaIdToken(payload.idToken, {
    expectedNonce: options.expectedNonce,
  });
  const session = buildAuthenticatedSession(
    verifiedIdTokenClaims,
    payload.leadId,
  );
  const expiresAt =
    typeof verifiedIdTokenClaims.exp === 'number'
      ? Math.trunc(verifiedIdTokenClaims.exp)
      : Math.floor(Date.now() / 1000) + 60 * 60;
  const storedSession = await createStoredWebAuthSession({
    session,
    tokens: {
      idToken: payload.idToken,
      ...options.serverTokens,
    },
    expiresAt,
  });

  return {
    storedSessionId: storedSession.sessionId,
    maxAge: Math.max(expiresAt - Math.floor(Date.now() / 1000), 60),
    response: { session },
  };
}

export function writeWebAuthSession(
  request: NextRequest,
  response: NextResponse,
  payload: SyncedWebAuthSession,
): void {
  setSignedCookie(
    response,
    request,
    AUTH_SESSION_COOKIE_NAME,
    { sessionId: payload.storedSessionId },
    {
      maxAge: payload.maxAge,
    },
  );
}

export async function clearWebAuthSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const storedSession = await readStoredSessionFromRequest(request);

  if (storedSession) {
    await clearStoredWebAuthSession(storedSession.sessionId);
    await clearApplicationFlow(storedSession.session, request, response);
  } else {
    clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
  }

  clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, request, LEGACY_AUTH_LOGOUT_HINT_COOKIE_NAME);
  clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
  clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
  clearCookie(response, request, CSRF_COOKIE_NAME);
}

export async function clearWebAuthLogoutArtifacts(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  await clearWebAuthSession(request, response);
}

export async function readLogoutHintIdToken(
  request: NextRequest,
): Promise<string | null> {
  return (await readStoredSessionFromRequest(request))?.tokens.idToken ?? null;
}

export async function requireAuthenticatedWebSession(
  request: NextRequest,
): Promise<WebAuthSession> {
  const { session } = await readWebAuthSession(request);

  if (!session.isAuthenticated || session.user === null) {
    throw new Error('Authentication is required for this request.');
  }

  return session;
}

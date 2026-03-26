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
  AUTH_LOGOUT_HINT_COOKIE_NAME,
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CUSTOMER_PROFILE_COOKIE_NAME,
  clearCookie,
  parseSignedCookieValue,
  setSignedCookie,
} from './cookies';
import { verifyOktaIdToken } from './okta-id-token';

export type SessionCookiePayload = {
  session: WebAuthSession;
  expiresAt: number;
};

export type LogoutHintCookiePayload = {
  idToken: string;
  expiresAt: number;
};

export type SyncedWebAuthSession = {
  cookiePayload: SessionCookiePayload;
  logoutHintCookiePayload: LogoutHintCookiePayload;
  maxAge: number;
  response: SyncWebAuthSessionResponse;
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
  const authenticationMethods = Array.isArray(claims.amr)
    ? claims.amr.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    id,
    email,
    displayName,
    firstName,
    lastName,
    leadId,
    customerId,
    authenticationMethods,
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

export function readWebAuthSession(
  request: NextRequest,
  options: { includeDebug?: boolean } = {},
): GetWebAuthSessionResponse {
  const cookiePayload = readSessionCookiePayload(
    request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value,
  );

  if (cookiePayload === null) {
    return {
      session: buildUnauthenticatedSession(),
      ...(options.includeDebug
        ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
        : {}),
    };
  }

  return {
    session: cookiePayload.session,
    ...(options.includeDebug
      ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
      : {}),
  };
}

export function readSessionCookiePayload(
  rawCookieValue?: string,
): SessionCookiePayload | null {
  const cookiePayload =
    parseSignedCookieValue<SessionCookiePayload>(rawCookieValue);

  if (cookiePayload === null) {
    return null;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (cookiePayload.expiresAt <= currentEpochSeconds) {
    return null;
  }

  return cookiePayload;
}

export async function syncWebAuthSession(
  payload: SyncWebAuthSessionRequest,
): Promise<SyncedWebAuthSession> {
  const verifiedIdTokenClaims = await verifyOktaIdToken(payload.idToken);
  const session = buildAuthenticatedSession(
    verifiedIdTokenClaims,
    payload.leadId,
  );

  const expiresAt =
    typeof verifiedIdTokenClaims.exp === 'number'
      ? Math.trunc(verifiedIdTokenClaims.exp)
      : Math.floor(Date.now() / 1000) + 60 * 60;

  return {
    cookiePayload: {
      session,
      expiresAt,
    },
    logoutHintCookiePayload: {
      idToken: payload.idToken,
      expiresAt,
    },
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
    payload.cookiePayload,
    {
      maxAge: payload.maxAge,
    },
  );
  setSignedCookie(
    response,
    request,
    AUTH_LOGOUT_HINT_COOKIE_NAME,
    payload.logoutHintCookiePayload,
    {
      maxAge: payload.maxAge,
    },
  );
}

export function clearWebAuthSession(
  request: NextRequest,
  response: NextResponse,
): void {
  clearApplicationFlow(request, response);
  clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
  clearCookie(response, request, CSRF_COOKIE_NAME);
}

export function clearWebAuthLogoutArtifacts(
  request: NextRequest,
  response: NextResponse,
): void {
  clearWebAuthSession(request, response);
  clearCookie(response, request, AUTH_LOGOUT_HINT_COOKIE_NAME);
}

export function readLogoutHintIdToken(request: NextRequest): string | null {
  const cookiePayload = parseSignedCookieValue<LogoutHintCookiePayload>(
    request.cookies.get(AUTH_LOGOUT_HINT_COOKIE_NAME)?.value,
  );

  if (cookiePayload === null) {
    return null;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (cookiePayload.expiresAt <= currentEpochSeconds) {
    return null;
  }

  return cookiePayload.idToken;
}

export function requireAuthenticatedWebSession(
  request: NextRequest,
): WebAuthSession {
  const { session } = readWebAuthSession(request);

  if (!session.isAuthenticated || session.user === null) {
    throw new Error('Authentication is required for this request.');
  }

  return session;
}

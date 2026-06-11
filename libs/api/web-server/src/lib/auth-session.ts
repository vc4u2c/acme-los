import type {
  GetWebAuthSessionResponse,
  RequireWebAuthSessionRequest,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  TouchWebAuthSessionResponse,
  WebAuthSession,
  WebAuthSessionUser,
} from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { clearApplicationFlow } from './application-flow';
import {
  getAssuranceLevelFromAuthenticationEvidence,
  getAssuranceLevelFromAuthenticationMethods,
  isAssuranceSatisfied,
  MOCK_AUTH_STORAGE_KEY,
  type WebAuthRequirement,
} from './assurance';
import {
  clearBffWebAuthSession,
  readBffLogoutHintIdToken,
  readBffWebAuthSession,
  requireBffWebAuthSession,
  syncBffWebAuthSession,
  touchBffWebAuthSession,
} from './bff-auth-session-client';
import { isBffProxyEnabled } from './bff-config';
import { getServerWebAuthConfig } from './config';
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
  getStoredWebAuthSessionCookieMaxAge,
  getStoredWebAuthSessionTiming,
  readStoredWebAuthSession,
  readStoredWebAuthSessionForLogout,
  isStoredWebAuthStepUpFresh,
  touchStoredWebAuthSession,
  type StoredWebAuthSession,
  type StoredWebAuthStepUpRequirement,
  type StoredWebAuthTokenSet,
  writeStoredWebAuthSession,
} from './session-store';
import { refreshOktaTokenSet, type OktaTokenResponse } from './okta-auth-flow';
import { resolveAbsoluteSessionExpiresAt } from './session-timeout';

const LEGACY_AUTH_LOGOUT_HINT_COOKIE_NAME = 'acme-los.auth-logout';
const TOKEN_REFRESH_WINDOW_SECONDS = 60;

export type SessionCookiePayload = {
  sessionId: string;
};

export type SyncedWebAuthSession = {
  storedSessionId: string;
  maxAge: number;
  response: SyncWebAuthSessionResponse;
};

export type TouchedWebAuthSession = {
  storedSessionId: string;
  maxAge: number;
  response: TouchWebAuthSessionResponse;
};

type WritableWebAuthSession = Pick<
  SyncedWebAuthSession | TouchedWebAuthSession,
  'storedSessionId' | 'maxAge'
>;

type ResolvedStoredSession = {
  sessionId: string;
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
  storedSession: StoredWebAuthSession;
};

type TokenRefreshDependencies = {
  refreshOktaTokenSet: typeof refreshOktaTokenSet;
  verifyOktaIdToken: typeof verifyOktaIdToken;
};

function shouldUseBffAuthSessionAuthority(): boolean {
  return isBffProxyEnabled() && getServerWebAuthConfig().provider !== 'mock';
}

function toBffRequirement(
  requirement: WebAuthRequirement,
): RequireWebAuthSessionRequest {
  return {
    requiresAuthentication: requirement.requiresAuthentication,
    minimumAssuranceLevel: requirement.minimumAssuranceLevel,
    requiredStepUp: requirement.requiredStepUp,
  };
}

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

function buildMockSession(user: WebAuthSessionUser): WebAuthSession {
  return {
    provider: 'mock',
    status: 'authenticated',
    isAuthenticated: true,
    assuranceLevel: getAssuranceLevelFromAuthenticationMethods(
      user.authenticationMethods,
    ),
    user,
  };
}

function buildMockUnauthenticatedSession(
  errorMessage?: string,
): WebAuthSession {
  return {
    provider: 'mock',
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
  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  if (!subject) {
    return null;
  }

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
  return {
    id: subject,
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
  acceptedHighAssuranceAcrValues?: string[],
): WebAuthSession {
  const user = buildAuthUserFromClaims(claims, fallbackLeadId);
  if (!user) {
    throw new Error('The Okta ID token is missing the required subject claim.');
  }

  return {
    provider: 'okta',
    status: 'authenticated',
    isAuthenticated: true,
    assuranceLevel: getAssuranceLevelFromAuthenticationEvidence({
      authenticationMethods: user.authenticationMethods,
      acr: claims.acr,
      acceptedHighAssuranceAcrValues,
    }),
    user,
  };
}

function getConfiguredHighAssuranceAcrValues(): string[] {
  const config = getServerWebAuthConfig();

  return config.provider === 'okta' && config.okta?.fundingStepUpAcrValues
    ? [config.okta.fundingStepUpAcrValues]
    : [];
}

function readMockRequestSession(request: NextRequest): WebAuthSession | null {
  if (getServerWebAuthConfig().provider !== 'mock') {
    return null;
  }

  const rawCookieValue = request.cookies.get(MOCK_AUTH_STORAGE_KEY)?.value;

  if (!rawCookieValue) {
    return null;
  }

  try {
    const user = JSON.parse(
      decodeURIComponent(rawCookieValue),
    ) as WebAuthSessionUser | null;

    return user ? buildMockSession(user) : null;
  } catch {
    return null;
  }
}

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getCreatedAtEpochSeconds(createdAt: number): number {
  return createdAt > 10_000_000_000
    ? Math.floor(createdAt / 1000)
    : Math.floor(createdAt);
}

function shouldRefreshStoredSessionTokens(
  storedSession: StoredWebAuthSession,
): boolean {
  return (
    Boolean(storedSession.tokens.refreshToken) &&
    storedSession.expiresAt - getCurrentEpochSeconds() <=
      TOKEN_REFRESH_WINDOW_SECONDS
  );
}

function mergeRefreshedTokenSet(
  storedSession: StoredWebAuthSession,
  tokenResponse: OktaTokenResponse,
): StoredWebAuthTokenSet {
  return {
    idToken: tokenResponse.id_token ?? storedSession.tokens.idToken,
    accessToken: tokenResponse.access_token ?? storedSession.tokens.accessToken,
    refreshToken:
      tokenResponse.refresh_token ?? storedSession.tokens.refreshToken,
    tokenType: tokenResponse.token_type ?? storedSession.tokens.tokenType,
    scope: tokenResponse.scope ?? storedSession.tokens.scope,
    expiresIn: tokenResponse.expires_in ?? storedSession.tokens.expiresIn,
  };
}

async function refreshStoredSessionTokensIfNeeded(
  storedSession: StoredWebAuthSession,
  dependencies: TokenRefreshDependencies,
): Promise<StoredWebAuthSession> {
  const refreshToken = storedSession.tokens.refreshToken;

  if (!refreshToken || !shouldRefreshStoredSessionTokens(storedSession)) {
    return storedSession;
  }

  const tokenResponse = await dependencies.refreshOktaTokenSet({
    refreshToken,
  });
  const idToken = tokenResponse.id_token;

  if (!idToken) {
    throw new Error('Okta did not return an id token for this refresh.');
  }

  const verifiedIdTokenClaims = await dependencies.verifyOktaIdToken(idToken);
  const refreshedSession = buildAuthenticatedSession(
    verifiedIdTokenClaims,
    storedSession.session.user?.leadId,
  );
  const currentEpochSeconds = getCurrentEpochSeconds();
  const tokenExpiresAt =
    typeof verifiedIdTokenClaims.exp === 'number'
      ? Math.trunc(verifiedIdTokenClaims.exp)
      : currentEpochSeconds + (tokenResponse.expires_in ?? 60 * 60);
  const expiresAt = resolveAbsoluteSessionExpiresAt(
    tokenExpiresAt,
    getCreatedAtEpochSeconds(storedSession.createdAt),
  );

  return {
    ...storedSession,
    session: refreshedSession,
    tokens: mergeRefreshedTokenSet(storedSession, tokenResponse),
    expiresAt,
    idleExpiresAt: Math.min(expiresAt, storedSession.idleExpiresAt),
  };
}

async function readStoredSessionFromRequest(
  request: NextRequest,
): Promise<ResolvedStoredSession | null> {
  const sessionCookiePayload = readSessionCookiePayloadFromRequest(request);

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
    storedSession,
  };
}

function readSessionCookiePayloadFromRequest(
  request: NextRequest,
): SessionCookiePayload | null {
  return readSessionCookiePayload(
    request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value,
  );
}

export async function readWebAuthSession(
  request: NextRequest,
  options: { includeDebug?: boolean } = {},
): Promise<GetWebAuthSessionResponse> {
  const mockSession = readMockRequestSession(request);

  if (mockSession) {
    return {
      session: mockSession,
      ...(options.includeDebug
        ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
        : {}),
    };
  }

  if (getServerWebAuthConfig().provider === 'mock') {
    return {
      session: buildMockUnauthenticatedSession(),
      ...(options.includeDebug
        ? { debug: { idTokenClaims: null, accessTokenClaims: null } }
        : {}),
    };
  }

  if (shouldUseBffAuthSessionAuthority()) {
    return readBffWebAuthSession({ request }, options);
  }

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
    sessionTiming: getStoredWebAuthSessionTiming(storedSession.storedSession),
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
    expectedUserId?: string;
    minimumAssuranceLevel?: WebAuthRequirement['minimumAssuranceLevel'];
    request?: NextRequest;
    stepUp?: StoredWebAuthStepUpRequirement;
    serverTokens?: Omit<StoredWebAuthTokenSet, 'idToken'>;
  } = {},
): Promise<SyncedWebAuthSession> {
  const verifiedIdTokenClaims = await verifyOktaIdToken(payload.idToken, {
    expectedNonce: options.expectedNonce,
  });
  const session = buildAuthenticatedSession(
    verifiedIdTokenClaims,
    payload.leadId,
    options.minimumAssuranceLevel === 'aal2'
      ? getConfiguredHighAssuranceAcrValues()
      : undefined,
  );

  if (options.expectedUserId && session.user?.id !== options.expectedUserId) {
    throw new Error('Step-up sign-in must complete with the same user.');
  }

  if (
    options.minimumAssuranceLevel &&
    !isAssuranceSatisfied(session.assuranceLevel, options.minimumAssuranceLevel)
  ) {
    throw new Error(
      'The completed sign-in did not satisfy the required assurance level.',
    );
  }

  const expiresAt =
    typeof verifiedIdTokenClaims.exp === 'number'
      ? Math.trunc(verifiedIdTokenClaims.exp)
      : Math.floor(Date.now() / 1000) + 60 * 60;

  if (shouldUseBffAuthSessionAuthority()) {
    if (!options.request) {
      throw new Error(
        'A Next request is required when the BFF owns auth session state.',
      );
    }

    return syncBffWebAuthSession(options.request, {
      ...payload,
      session,
      expiresAt,
      serverTokens: {
        idToken: payload.idToken,
        ...options.serverTokens,
      },
      stepUp: options.stepUp,
    });
  }

  const storedSession = await createStoredWebAuthSession({
    session,
    tokens: {
      idToken: payload.idToken,
      ...options.serverTokens,
    },
    expiresAt,
    stepUp: options.stepUp,
  });

  return {
    storedSessionId: storedSession.sessionId,
    maxAge: getStoredWebAuthSessionCookieMaxAge(storedSession),
    response: {
      session,
      sessionTiming: getStoredWebAuthSessionTiming(storedSession),
    },
  };
}

export async function touchWebAuthSession(
  request: NextRequest,
  dependencies: TokenRefreshDependencies = {
    refreshOktaTokenSet,
    verifyOktaIdToken,
  },
): Promise<TouchedWebAuthSession | null> {
  const mockSession = readMockRequestSession(request);

  if (mockSession) {
    return {
      storedSessionId: 'mock',
      maxAge: 60 * 60,
      response: {
        session: mockSession,
        touched: true,
      },
    };
  }

  if (shouldUseBffAuthSessionAuthority()) {
    return touchBffWebAuthSession(request);
  }

  const sessionCookiePayload = readSessionCookiePayloadFromRequest(request);

  if (!sessionCookiePayload) {
    return null;
  }

  const storedSession = await readStoredWebAuthSession(
    sessionCookiePayload.sessionId,
  );

  if (!storedSession) {
    return null;
  }

  const refreshedSession = await refreshStoredSessionTokensIfNeeded(
    storedSession,
    dependencies,
  );

  if (refreshedSession !== storedSession) {
    await writeStoredWebAuthSession(refreshedSession);
  }

  const touchedSession = await touchStoredWebAuthSession(
    sessionCookiePayload.sessionId,
  );

  if (!touchedSession) {
    return null;
  }

  return {
    storedSessionId: touchedSession.sessionId,
    maxAge: getStoredWebAuthSessionCookieMaxAge(touchedSession),
    response: {
      session: touchedSession.session,
      sessionTiming: getStoredWebAuthSessionTiming(touchedSession),
      touched: true,
    },
  };
}

export function writeWebAuthSession(
  request: NextRequest,
  response: NextResponse,
  payload: WritableWebAuthSession,
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
  const mockSession = readMockRequestSession(request);

  if (shouldUseBffAuthSessionAuthority() && !mockSession) {
    const sessionResponse = await readBffWebAuthSession({ request }).catch(
      () => null,
    );

    await clearBffWebAuthSession(request);

    if (sessionResponse?.session.isAuthenticated) {
      await clearApplicationFlow(sessionResponse.session, request, response);
    } else {
      clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
    }

    clearCookie(response, request, MOCK_AUTH_STORAGE_KEY);
    clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
    clearCookie(response, request, LEGACY_AUTH_LOGOUT_HINT_COOKIE_NAME);
    clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
    clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
    clearCookie(response, request, CSRF_COOKIE_NAME);
    return;
  }

  const sessionCookiePayload = readSessionCookiePayloadFromRequest(request);
  const storedSession = await readStoredSessionFromRequest(request);
  const logoutStoredSession =
    storedSession === null && sessionCookiePayload
      ? await readStoredWebAuthSessionForLogout(sessionCookiePayload.sessionId)
      : null;
  const cleanupSession = storedSession ?? logoutStoredSession;

  if (sessionCookiePayload) {
    await clearStoredWebAuthSession(sessionCookiePayload.sessionId);
  }

  if (cleanupSession) {
    await clearApplicationFlow(cleanupSession.session, request, response);
  } else if (mockSession) {
    await clearApplicationFlow(mockSession, request, response);
  } else {
    clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
  }

  clearCookie(response, request, MOCK_AUTH_STORAGE_KEY);
  clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, request, LEGACY_AUTH_LOGOUT_HINT_COOKIE_NAME);
  clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
  clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
  clearCookie(response, request, CSRF_COOKIE_NAME);
}

export async function clearReplacedWebAuthSession(
  request: NextRequest,
  nextStoredSessionId: string,
): Promise<void> {
  if (shouldUseBffAuthSessionAuthority()) {
    return;
  }

  const sessionCookiePayload = readSessionCookiePayloadFromRequest(request);

  if (
    !sessionCookiePayload ||
    sessionCookiePayload.sessionId === nextStoredSessionId
  ) {
    return;
  }

  await clearStoredWebAuthSession(sessionCookiePayload.sessionId);
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
  if (shouldUseBffAuthSessionAuthority()) {
    return readBffLogoutHintIdToken(request);
  }

  const sessionCookiePayload = readSessionCookiePayloadFromRequest(request);

  if (!sessionCookiePayload) {
    return null;
  }

  return (
    (await readStoredWebAuthSessionForLogout(sessionCookiePayload.sessionId))
      ?.tokens.idToken ?? null
  );
}

export async function requireAuthenticatedWebSession(
  request: NextRequest,
  requirement: WebAuthRequirement = {
    requiresAuthentication: true,
    minimumAssuranceLevel: 'aal1',
  },
): Promise<WebAuthSession> {
  const mockSession = readMockRequestSession(request);

  if (mockSession) {
    if (!mockSession.isAuthenticated || mockSession.user === null) {
      throw new Error('Authentication is required for this request.');
    }

    const minimumAssuranceLevel = requirement.minimumAssuranceLevel ?? 'aal1';

    if (
      !isAssuranceSatisfied(mockSession.assuranceLevel, minimumAssuranceLevel)
    ) {
      throw new Error('Step-up MFA is required for this request.');
    }

    return mockSession;
  }

  if (shouldUseBffAuthSessionAuthority()) {
    const requirementResponse = await requireBffWebAuthSession(
      { request },
      toBffRequirement(requirement),
    );

    if (!requirementResponse.satisfied) {
      throw new Error(
        requirementResponse.errorMessage ??
          'Authentication is required for this request.',
      );
    }

    return requirementResponse.session;
  }

  const storedSession = await readStoredSessionFromRequest(request);
  const session = storedSession?.session ?? buildUnauthenticatedSession();

  if (!session.isAuthenticated || session.user === null) {
    throw new Error('Authentication is required for this request.');
  }

  const minimumAssuranceLevel = requirement.minimumAssuranceLevel ?? 'aal1';
  if (!isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel)) {
    throw new Error('Step-up MFA is required for this request.');
  }

  if (
    requirement.requiredStepUp &&
    (!storedSession ||
      !isStoredWebAuthStepUpFresh(
        storedSession.storedSession,
        requirement.requiredStepUp,
      ))
  ) {
    throw new Error('Fresh funding step-up MFA is required for this request.');
  }

  return session;
}

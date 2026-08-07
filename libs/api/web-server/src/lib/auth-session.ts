import type {
  GetWebAuthSessionResponse,
  RequireWebAuthSessionRequest,
  TouchWebAuthSessionResponse,
  WebAuthSession,
  WebAuthSessionUser,
  StartLogoutResponse,
} from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { clearApplicationFlow } from './application-flow';
import {
  getAssuranceLevelFromAuthenticationMethods,
  isAssuranceSatisfied,
  MOCK_AUTH_STORAGE_KEY,
  type WebAuthRequirement,
} from './assurance';
import {
  clearBffWebAuthSession,
  readBffWebAuthSession,
  requireBffWebAuthSession,
  startBffLogout,
  touchBffWebAuthSession,
} from './bff-auth-session-client';
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

export type SessionCookiePayload = {
  sessionId: string;
};

export type WritableWebAuthSession = {
  storedSessionId: string;
  maxAge: number;
};

export type TouchedWebAuthSession = WritableWebAuthSession & {
  response: TouchWebAuthSessionResponse;
};

function toBffRequirement(
  requirement: WebAuthRequirement,
): RequireWebAuthSessionRequest {
  return {
    requiresAuthentication: requirement.requiresAuthentication,
    minimumAssuranceLevel: requirement.minimumAssuranceLevel,
    requiredStepUp: requirement.requiredStepUp,
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

function clearBrowserAuthCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  clearCookie(response, request, MOCK_AUTH_STORAGE_KEY);
  clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
  clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
  clearCookie(response, request, CSRF_COOKIE_NAME);
}

export async function readWebAuthSession(
  request: NextRequest,
): Promise<GetWebAuthSessionResponse> {
  const mockSession = readMockRequestSession(request);

  if (mockSession) {
    return { session: mockSession };
  }

  if (getServerWebAuthConfig().provider === 'mock') {
    return { session: buildMockUnauthenticatedSession() };
  }

  return readBffWebAuthSession({ request });
}

export function readSessionCookiePayload(
  rawCookieValue?: string,
): SessionCookiePayload | null {
  return parseSignedCookieValue<SessionCookiePayload>(rawCookieValue);
}

export async function touchWebAuthSession(
  request: NextRequest,
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

  if (getServerWebAuthConfig().provider === 'mock') {
    return null;
  }

  return touchBffWebAuthSession(request);
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

  if (getServerWebAuthConfig().provider !== 'mock' && !mockSession) {
    const sessionResponse = await readBffWebAuthSession({ request }).catch(
      () => null,
    );

    await clearBffWebAuthSession(request);

    if (sessionResponse?.session.isAuthenticated) {
      await clearApplicationFlow(sessionResponse.session, request, response);
    } else {
      clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
    }

    clearBrowserAuthCookies(request, response);
    return;
  }

  if (mockSession) {
    await clearApplicationFlow(mockSession, request, response);
  } else {
    clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
  }

  clearBrowserAuthCookies(request, response);
}

export async function clearWebAuthLogoutArtifacts(
  request: NextRequest,
  response: NextResponse,
  postLogoutRedirectUri: string,
): Promise<StartLogoutResponse | null> {
  const mockSession = readMockRequestSession(request);

  if (getServerWebAuthConfig().provider === 'mock' || mockSession) {
    await clearWebAuthSession(request, response);
    return null;
  }

  const sessionResponse = await readBffWebAuthSession({ request }).catch(
    () => null,
  );
  const logout = await startBffLogout(request, {
    postLogoutRedirectUri,
  }).catch(async () => {
    await clearBffWebAuthSession(request).catch(() => undefined);
    return null;
  });

  if (sessionResponse?.session.isAuthenticated) {
    await clearApplicationFlow(sessionResponse.session, request, response);
  } else {
    clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
  }

  clearBrowserAuthCookies(request, response);
  return logout;
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

  if (getServerWebAuthConfig().provider === 'mock') {
    throw new Error('Authentication is required for this request.');
  }

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

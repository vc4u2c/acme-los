import type {
  GetWebAuthSessionResponse,
  RequireWebAuthSessionRequest,
  StartLogoutResponse,
  TouchWebAuthSessionResponse,
  WebAuthSession,
} from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { clearApplicationFlow } from './application-flow';
import type { WebAuthRequirement } from './assurance';
import {
  clearBffWebAuthSession,
  readBffWebAuthSession,
  requireBffWebAuthSession,
  startBffLogout,
  touchBffWebAuthSession,
} from './bff-auth-session-client';
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

function clearBrowserAuthCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  clearCookie(response, request, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
  clearCookie(response, request, CUSTOMER_PROFILE_COOKIE_NAME);
  clearCookie(response, request, CSRF_COOKIE_NAME);
}

export async function readWebAuthSession(
  request: NextRequest,
): Promise<GetWebAuthSessionResponse> {
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
    { maxAge: payload.maxAge },
  );
}

export async function clearWebAuthSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
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
}

export async function clearWebAuthLogoutArtifacts(
  request: NextRequest,
  response: NextResponse,
  postLogoutRedirectUri: string,
): Promise<StartLogoutResponse | null> {
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

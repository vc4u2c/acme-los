import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
  logAuthAuditEvent,
  touchWebAuthSession,
  writeWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const authSessionTouchRateLimitPolicy = {
  namespace: 'auth-session-touch',
  limit: 30,
  windowSeconds: 60,
} as const;

function buildUnauthenticatedTouchResponse(message: string) {
  return {
    touched: false,
    session: {
      provider: 'okta' as const,
      status: 'unauthenticated' as const,
      isAuthenticated: false,
      assuranceLevel: 'anonymous' as const,
      user: null,
      errorMessage: message,
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = await checkRateLimit(
      request,
      authSessionTouchRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        buildUnauthenticatedTouchResponse(
          'Too many session keep-alive attempts. Please wait a moment and try again.',
        ),
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.session.touch',
        outcome: 'rate_limited',
        message: 'Auth session touch rate limit exceeded.',
      });

      return response;
    }

    assertValidCsrf(request);

    const touchedSession = await touchWebAuthSession(request);

    if (!touchedSession) {
      const response = NextResponse.json(
        buildUnauthenticatedTouchResponse(
          'The auth session is no longer active.',
        ),
        { status: 401 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.session.touch',
        outcome: 'failure',
        message: 'Auth session touch attempted without an active session.',
      });

      return response;
    }

    const response = NextResponse.json(touchedSession.response);

    writeWebAuthSession(request, response, touchedSession);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.session.touch',
      outcome: 'success',
      message: 'Touched auth session idle timer.',
      session: touchedSession.response.session,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to keep the auth session active.';

    logAuthAuditEvent(request, {
      event: 'auth.session.touch',
      outcome: 'failure',
      message,
    });

    return NextResponse.json(buildUnauthenticatedTouchResponse(message), {
      status: 400,
    });
  }
}

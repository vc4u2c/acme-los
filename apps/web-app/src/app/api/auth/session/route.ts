import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
  clearWebAuthSession,
  logAuthAuditEvent,
  readWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const authSessionMutationRateLimitPolicy = {
  namespace: 'auth-session-mutation',
  limit: 20,
  windowSeconds: 60,
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(await readWebAuthSession(request));
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = await checkRateLimit(
      request,
      authSessionMutationRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        {
          cleared: false,
          session: {
            provider: 'okta',
            status: 'error',
            isAuthenticated: false,
            assuranceLevel: 'anonymous',
            user: null,
            errorMessage:
              'Too many sign-out attempts. Please wait a moment and try again.',
          },
        },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.session.clear',
        outcome: 'rate_limited',
        message: 'Auth session clear rate limit exceeded.',
      });

      return response;
    }

    assertValidCsrf(request);

    const response = NextResponse.json({
      cleared: true,
      session: {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      },
    });

    await clearWebAuthSession(request, response);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.session.clear',
      outcome: 'success',
      message: 'Cleared auth session.',
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to clear auth session.';

    logAuthAuditEvent(request, {
      event: 'auth.session.clear',
      outcome: 'failure',
      message,
    });

    return NextResponse.json(
      {
        cleared: false,
        session: {
          provider: 'okta',
          status: 'error',
          isAuthenticated: false,
          assuranceLevel: 'anonymous',
          user: null,
          errorMessage: message,
        },
      },
      { status: 400 },
    );
  }
}

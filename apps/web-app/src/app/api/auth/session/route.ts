import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
  clearWebAuthSession,
  logAuthAuditEvent,
  readWebAuthSession,
  syncWebAuthSession,
  writeWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const authSessionMutationRateLimitPolicy = {
  namespace: 'auth-session-mutation',
  limit: 20,
  windowSeconds: 60,
} as const;

const syncSessionSchema = z.object({
  idToken: z.string().min(1),
  leadId: z.string().trim().min(1).optional(),
  accessTokenClaims: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const includeDebug = request.nextUrl.searchParams.get('includeDebug') === '1';

  return NextResponse.json(await readWebAuthSession(request, { includeDebug }));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = await checkRateLimit(
      request,
      authSessionMutationRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        {
          session: {
            provider: 'okta',
            status: 'error',
            isAuthenticated: false,
            assuranceLevel: 'anonymous',
            user: null,
            errorMessage:
              'Too many auth session updates. Please wait a moment and try again.',
          },
        },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.session.sync',
        outcome: 'rate_limited',
        message: 'Auth session sync rate limit exceeded.',
      });

      return response;
    }

    assertValidCsrf(request);

    const payload = syncSessionSchema.parse(await request.json());
    const syncedSession = await syncWebAuthSession(payload, { request });
    const response = NextResponse.json(syncedSession.response);

    writeWebAuthSession(request, response, syncedSession);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.session.sync',
      outcome: 'success',
      message: 'Synced auth session.',
      session: syncedSession.response.session,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to sync auth session.';

    logAuthAuditEvent(request, {
      event: 'auth.session.sync',
      outcome: 'failure',
      message,
    });

    return NextResponse.json(
      {
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

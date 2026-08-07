import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
  clearPostChangeAuthIntent,
  clearWebAuthTransaction,
  completeBffIdxAuthFlow,
  logAuthAuditEvent,
  writeWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const idxCompleteRateLimitPolicy = {
  namespace: 'auth-idx-complete',
  limit: 24,
  windowSeconds: 60,
} as const;

const idxCompleteSchema = z.object({
  interactionCode: z.string().trim().min(1).max(2048),
  state: z.string().trim().min(1).max(512),
});

function toClientSafeCompletionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('secure sign-in session expired')) {
    return 'Your secure sign-in session expired. Please start again.';
  }

  if (normalizedMessage.includes('same user')) {
    return 'For your protection, complete this check with the account already signed in.';
  }

  if (
    normalizedMessage.includes('must be completed with') ||
    normalizedMessage.includes('assurance level')
  ) {
    return message;
  }

  return 'Unable to complete secure sign-in. Please start again.';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const rateLimit = await checkRateLimit(request, idxCompleteRateLimitPolicy);

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        {
          error:
            'Too many secure verification attempts. Please wait a moment and try again.',
        },
        { status: 429 },
      );
      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.idx.complete',
        outcome: 'rate_limited',
        message: 'IDX completion rate limit exceeded.',
      });
      return response;
    }

    const payload = idxCompleteSchema.parse(await request.json());
    const syncedSession = await completeBffIdxAuthFlow(request, payload);
    const response = NextResponse.json(syncedSession.response);

    writeWebAuthSession(request, response, syncedSession);
    clearPostChangeAuthIntent(request, response);
    clearWebAuthTransaction(request, response);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.idx.complete',
      outcome: 'success',
      message: 'Completed BFF-backed IDX interaction-code exchange.',
      session: syncedSession.response.session,
      metadata: {
        returnTo: syncedSession.response.returnTo,
      },
    });

    return response;
  } catch (error) {
    const response = NextResponse.json(
      { error: toClientSafeCompletionError(error) },
      { status: 400 },
    );

    clearWebAuthTransaction(request, response);
    logAuthAuditEvent(request, {
      event: 'auth.idx.complete',
      outcome: 'failure',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to complete the IDX transaction.',
    });

    return response;
  }
}

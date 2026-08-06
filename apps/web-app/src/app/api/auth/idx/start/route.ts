import { NextRequest, NextResponse } from 'next/server';
import type { WebAuthStepUpReason } from '@acme-los/api/contracts';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
  clearPostChangeAuthIntent,
  logAuthAuditEvent,
  POST_CHANGE_AUTH_COOKIE_NAME,
  POST_CHANGE_AUTH_MAX_AGE_SECONDS,
  readPostChangeAuthIntent,
  readWebAuthSession,
  startBffIdxAuthFlow,
  writeBffWebAuthTransaction,
  type PostChangeAuthAction,
} from '@acme-los/api/web-server';
import {
  getApplicationAuthRequirementForPath,
  getMinimumAssuranceLevelForApplicationPath,
} from '../../../../../lib/application-auth';

export const runtime = 'nodejs';

const idxStartRateLimitPolicy = {
  namespace: 'auth-idx-start',
  limit: 12,
  windowSeconds: 60,
} as const;

const postChangeIdxStartRateLimitPolicy = {
  namespace: 'auth-idx-post-change-start',
  limit: 8,
  windowSeconds: 60,
} as const;

const postChangeReasonByAction: Record<
  PostChangeAuthAction,
  WebAuthStepUpReason
> = {
  email: 'post-email-change',
  phone: 'post-phone-change',
  password: 'post-password-change',
};

const idxStartSchema = z.object({
  returnTo: z.string().optional(),
  minimumAssuranceLevel: z.enum(['aal1', 'aal2']).optional(),
  leadId: z.string().trim().min(1).max(128).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const postChangeIntent = readPostChangeAuthIntent(request);
    const rateLimit = await checkRateLimit(
      request,
      postChangeIntent
        ? postChangeIdxStartRateLimitPolicy
        : idxStartRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        {
          error:
            'Too many secure sign-in attempts. Please wait a moment and try again.',
        },
        { status: 429 },
      );
      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.idx.start',
        outcome: 'rate_limited',
        message: 'IDX sign-in start rate limit exceeded.',
      });
      return response;
    }

    const payload = idxStartSchema.parse(await request.json());
    const routeRequirement = postChangeIntent
      ? undefined
      : getApplicationAuthRequirementForPath(payload.returnTo);
    const minimumAssuranceLevel = postChangeIntent
      ? 'aal2'
      : getMinimumAssuranceLevelForApplicationPath(
          payload.returnTo,
          payload.minimumAssuranceLevel ?? 'aal1',
        );
    const currentSession =
      !postChangeIntent && minimumAssuranceLevel === 'aal2'
        ? await readWebAuthSession(request)
        : null;
    const expectedUserId = postChangeIntent
      ? postChangeIntent.expectedUserId
      : currentSession?.session.isAuthenticated &&
          currentSession.session.user !== null
        ? currentSession.session.user.id
        : undefined;
    const stepUp = postChangeIntent
      ? {
          reason: postChangeReasonByAction[postChangeIntent.action],
          maxAgeSeconds: POST_CHANGE_AUTH_MAX_AGE_SECONDS,
          consumeOnSatisfied: true,
        }
      : minimumAssuranceLevel === 'aal2'
        ? routeRequirement?.requiredStepUp
        : undefined;
    const transaction = await startBffIdxAuthFlow(request, {
      returnTo: postChangeIntent ? '/account/profile' : payload.returnTo,
      minimumAssuranceLevel,
      expectedUserId,
      leadId: postChangeIntent ? undefined : payload.leadId,
      stepUp,
    });
    const response = NextResponse.json(transaction);

    writeBffWebAuthTransaction(request, response, {
      transactionId: transaction.transactionId,
      returnTo: transaction.returnTo,
      minimumAssuranceLevel,
      maxAge: transaction.maxAge,
    });
    if (
      !postChangeIntent &&
      request.cookies.has(POST_CHANGE_AUTH_COOKIE_NAME)
    ) {
      clearPostChangeAuthIntent(request, response);
    }
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.idx.start',
      outcome: 'success',
      message: 'Started BFF-backed IDX transaction.',
      metadata: {
        returnTo: transaction.returnTo,
        minimumAssuranceLevel,
        stepUpReason: transaction.stepUpReason,
        mode: postChangeIntent ? 'post-change' : 'standard',
      },
    });

    return response;
  } catch (error) {
    logAuthAuditEvent(request, {
      event: 'auth.idx.start',
      outcome: 'failure',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to begin the IDX transaction.',
    });

    return NextResponse.json(
      {
        error: 'Unable to begin secure sign-in. Please try again.',
      },
      { status: 400 },
    );
  }
}

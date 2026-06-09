import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  buildPublicRequestUrl,
  buildSignInRedirectPath,
  clearWebAuthTransaction,
  checkRateLimit,
  isBffProxyEnabled,
  logAuthAuditEvent,
  readWebAuthSession,
  startBffAuthFlow,
  startOktaAuthTransaction,
  writeBffWebAuthTransaction,
  writeWebAuthTransaction,
} from '@acme-los/api/web-server';
import {
  getApplicationAuthRequirementForPath,
  getMinimumAssuranceLevelForApplicationPath,
} from '../../../../lib/application-auth';

export const runtime = 'nodejs';

const authStartRateLimitPolicy = {
  namespace: 'auth-start',
  limit: 12,
  windowSeconds: 60,
} as const;

const authStartQuerySchema = z.object({
  returnTo: z.string().optional(),
  aal: z.enum(['aal1', 'aal2']).optional(),
  leadId: z.string().trim().min(1).optional(),
  lead_id: z.string().trim().min(1).optional(),
});

function buildErrorRedirect(
  request: NextRequest,
  {
    returnTo,
    minimumAssuranceLevel,
    authError,
  }: {
    returnTo?: string;
    minimumAssuranceLevel?: 'aal1' | 'aal2';
    authError: string;
  },
): NextResponse {
  const response = NextResponse.redirect(
    buildPublicRequestUrl(
      request,
      buildSignInRedirectPath({
        returnTo: returnTo ?? '/apply/personal-info',
        minimumAssuranceLevel,
        authError,
      }),
    ),
  );

  clearWebAuthTransaction(request, response);

  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = await checkRateLimit(request, authStartRateLimitPolicy);

    if (!rateLimit.allowed) {
      const response = buildErrorRedirect(request, {
        returnTo: request.nextUrl.searchParams.get('returnTo') ?? undefined,
        minimumAssuranceLevel:
          request.nextUrl.searchParams.get('aal') === 'aal2' ? 'aal2' : 'aal1',
        authError:
          'Too many secure sign-in attempts. Please wait a moment and try again.',
      });

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.start',
        outcome: 'rate_limited',
        message: 'Secure sign-in start rate limit exceeded.',
      });

      return response;
    }

    const payload = authStartQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const routeRequirement = getApplicationAuthRequirementForPath(
      payload.returnTo,
    );
    const minimumAssuranceLevel = getMinimumAssuranceLevelForApplicationPath(
      payload.returnTo,
      payload.aal ?? 'aal1',
    );
    const currentSession =
      minimumAssuranceLevel === 'aal2'
        ? await readWebAuthSession(request)
        : null;
    const expectedUserId =
      currentSession?.session.isAuthenticated &&
      currentSession.session.user !== null
        ? currentSession.session.user.id
        : undefined;
    const leadId = payload.leadId ?? payload.lead_id;
    const stepUp =
      minimumAssuranceLevel === 'aal2'
        ? routeRequirement?.requiredStepUp
        : undefined;

    if (isBffProxyEnabled()) {
      const transaction = await startBffAuthFlow(request, {
        returnTo: payload.returnTo,
        minimumAssuranceLevel,
        expectedUserId,
        leadId,
        stepUp,
      });
      const response = NextResponse.redirect(transaction.authorizeUrl);

      writeBffWebAuthTransaction(request, response, {
        transactionId: transaction.transactionId,
        returnTo: transaction.returnTo,
        minimumAssuranceLevel,
        maxAge: transaction.maxAge,
      });
      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.start',
        outcome: 'success',
        message: 'Started BFF-backed secure sign-in redirect.',
        metadata: {
          returnTo: transaction.returnTo,
          minimumAssuranceLevel,
        },
      });

      return response;
    }

    const transaction = startOktaAuthTransaction({
      returnTo: payload.returnTo,
      minimumAssuranceLevel,
      expectedUserId,
      leadId,
      stepUp,
    });
    const response = NextResponse.redirect(transaction.authorizeUrl);

    await writeWebAuthTransaction(request, response, transaction);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.start',
      outcome: 'success',
      message: 'Started secure sign-in redirect.',
      metadata: {
        returnTo: transaction.storedTransaction.returnTo,
        minimumAssuranceLevel:
          transaction.storedTransaction.minimumAssuranceLevel,
      },
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to begin secure sign-in.';

    logAuthAuditEvent(request, {
      event: 'auth.start',
      outcome: 'failure',
      message,
    });

    return buildErrorRedirect(request, {
      returnTo: request.nextUrl.searchParams.get('returnTo') ?? undefined,
      minimumAssuranceLevel:
        request.nextUrl.searchParams.get('aal') === 'aal2' ? 'aal2' : 'aal1',
      authError: message,
    });
  }
}

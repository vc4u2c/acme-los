import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  buildSignInRedirectPath,
  clearWebAuthTransaction,
  checkRateLimit,
  logAuthAuditEvent,
  startOktaAuthTransaction,
  writeWebAuthTransaction,
} from '@acme-los/api/web-server';

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
    new URL(
      buildSignInRedirectPath({
        returnTo: returnTo ?? '/apply/personal-info',
        minimumAssuranceLevel,
        authError,
      }),
      request.url,
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
    const transaction = startOktaAuthTransaction({
      returnTo: payload.returnTo,
      minimumAssuranceLevel: payload.aal ?? 'aal1',
      leadId: payload.leadId ?? payload.lead_id,
    });
    const response = NextResponse.redirect(transaction.authorizeUrl);

    writeWebAuthTransaction(request, response, transaction);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.start',
      outcome: 'success',
      message: 'Started secure sign-in redirect.',
      metadata: {
        returnTo: transaction.cookiePayload.returnTo,
        minimumAssuranceLevel: transaction.cookiePayload.minimumAssuranceLevel,
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

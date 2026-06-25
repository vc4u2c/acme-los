import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  buildPublicRequestUrl,
  buildSignInRedirectPath,
  checkRateLimit,
  completeBffAuthCallback,
  clearWebAuthTransaction,
  logAuthAuditEvent,
  readWebAuthTransactionCookie,
  writeWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const authCallbackRateLimitPolicy = {
  namespace: 'auth-callback',
  limit: 24,
  windowSeconds: 60,
} as const;

const authCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
});

function isRecoverableExpiredTransactionError(authError: string): boolean {
  return authError.toLowerCase().includes('secure sign-in session expired');
}

function buildSignInErrorResponse(request: NextRequest, authError: string) {
  const transaction = readWebAuthTransactionCookie(request);
  const response = NextResponse.redirect(
    buildPublicRequestUrl(
      request,
      buildSignInRedirectPath({
        returnTo: transaction?.returnTo ?? '/apply/personal-info',
        minimumAssuranceLevel: transaction?.minimumAssuranceLevel ?? 'aal1',
        authError,
        authRecovery: isRecoverableExpiredTransactionError(authError)
          ? 'restart'
          : undefined,
      }),
    ),
  );

  clearWebAuthTransaction(request, response);

  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = await checkRateLimit(
      request,
      authCallbackRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = buildSignInErrorResponse(
        request,
        'Too many secure callback attempts. Please start sign-in again.',
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'auth.callback',
        outcome: 'rate_limited',
        message: 'Secure callback rate limit exceeded.',
      });

      return response;
    }

    const query = authCallbackQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    if (query.error || query.error_description) {
      throw new Error(
        query.error_description ?? query.error ?? 'Sign-in failed.',
      );
    }

    if (!query.code || !query.state) {
      throw new Error(
        'The Okta callback did not include the expected code and state.',
      );
    }

    const syncedSession = await completeBffAuthCallback(request, {
      code: query.code,
      state: query.state,
    });
    const response = NextResponse.redirect(
      buildPublicRequestUrl(request, syncedSession.response.returnTo),
    );

    writeWebAuthSession(request, response, syncedSession);
    clearWebAuthTransaction(request, response);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.callback',
      outcome: 'success',
      message: 'Completed BFF-backed secure callback exchange.',
      session: syncedSession.response.session,
      metadata: {
        returnTo: syncedSession.response.returnTo,
      },
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to complete sign-in.';

    logAuthAuditEvent(request, {
      event: 'auth.callback',
      outcome: 'failure',
      message,
    });

    return buildSignInErrorResponse(request, message);
  }
}

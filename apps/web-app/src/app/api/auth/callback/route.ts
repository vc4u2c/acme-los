import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeaders,
  buildPublicRequestUrl,
  buildSignInRedirectPath,
  checkRateLimit,
  completeBffAuthCallback,
  clearReplacedWebAuthSession,
  clearWebAuthTransaction,
  deleteStoredWebAuthTransaction,
  exchangeOktaAuthorizationCode,
  isBffProxyEnabled,
  logAuthAuditEvent,
  readWebAuthTransactionCookie,
  readWebAuthTransaction,
  syncWebAuthSession,
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

function buildSignInErrorResponse(request: NextRequest, authError: string) {
  const transaction = readWebAuthTransactionCookie(request);
  const response = NextResponse.redirect(
    buildPublicRequestUrl(
      request,
      buildSignInRedirectPath({
        returnTo: transaction?.returnTo ?? '/apply/personal-info',
        minimumAssuranceLevel: transaction?.minimumAssuranceLevel ?? 'aal1',
        authError,
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
      if (!isBffProxyEnabled()) {
        await deleteStoredWebAuthTransaction(
          await readWebAuthTransaction(request),
        );
      }
      throw new Error(
        query.error_description ?? query.error ?? 'Sign-in failed.',
      );
    }

    if (!query.code || !query.state) {
      if (!isBffProxyEnabled()) {
        await deleteStoredWebAuthTransaction(
          await readWebAuthTransaction(request),
        );
      }
      throw new Error(
        'The Okta callback did not include the expected code and state.',
      );
    }

    if (isBffProxyEnabled()) {
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
    }

    const transaction = await readWebAuthTransaction(request);
    if (!transaction) {
      throw new Error(
        'Your secure sign-in session expired. Please start the hosted sign-in flow again.',
      );
    }

    if (query.state !== transaction.state) {
      await deleteStoredWebAuthTransaction(transaction);
      throw new Error(
        'The Okta callback state did not match this sign-in attempt.',
      );
    }

    await deleteStoredWebAuthTransaction(transaction);

    const tokenResponse = await exchangeOktaAuthorizationCode({
      code: query.code,
      codeVerifier: transaction.codeVerifier,
    });
    const syncedSession = await syncWebAuthSession(
      {
        idToken: tokenResponse.id_token ?? '',
        leadId: transaction.leadId,
      },
      {
        expectedNonce: transaction.nonce,
        expectedUserId: transaction.expectedUserId,
        minimumAssuranceLevel: transaction.minimumAssuranceLevel,
        request,
        stepUp: transaction.stepUp,
        serverTokens: {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenType: tokenResponse.token_type,
          scope: tokenResponse.scope,
          expiresIn: tokenResponse.expires_in,
        },
      },
    );
    const response = NextResponse.redirect(
      buildPublicRequestUrl(request, transaction.returnTo),
    );

    await clearReplacedWebAuthSession(request, syncedSession.storedSessionId);
    writeWebAuthSession(request, response, syncedSession);
    clearWebAuthTransaction(request, response);
    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'auth.callback',
      outcome: 'success',
      message: 'Completed secure callback exchange.',
      session: syncedSession.response.session,
      metadata: {
        returnTo: transaction.returnTo,
        minimumAssuranceLevel: transaction.minimumAssuranceLevel,
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

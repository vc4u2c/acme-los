import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildSignInRedirectPath,
  clearWebAuthTransaction,
  exchangeOktaAuthorizationCode,
  readWebAuthTransaction,
  syncWebAuthSession,
  writeWebAuthSession,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const authCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
});

function buildSignInErrorResponse(request: NextRequest, authError: string) {
  const transaction = readWebAuthTransaction(request);
  const response = NextResponse.redirect(
    new URL(
      buildSignInRedirectPath({
        returnTo: transaction?.returnTo ?? '/apply/personal-info',
        minimumAssuranceLevel: transaction?.minimumAssuranceLevel ?? 'aal1',
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
    const query = authCallbackQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const transaction = readWebAuthTransaction(request);

    if (query.error || query.error_description) {
      throw new Error(
        query.error_description ?? query.error ?? 'Sign-in failed.',
      );
    }

    if (!transaction) {
      throw new Error(
        'Your secure sign-in session expired. Please start the hosted sign-in flow again.',
      );
    }

    if (!query.code || !query.state) {
      throw new Error(
        'The Okta callback did not include the expected code and state.',
      );
    }

    if (query.state !== transaction.state) {
      throw new Error(
        'The Okta callback state did not match this sign-in attempt.',
      );
    }

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
      new URL(transaction.returnTo, request.url),
    );

    writeWebAuthSession(request, response, syncedSession);
    clearWebAuthTransaction(request, response);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to complete sign-in.';

    return buildSignInErrorResponse(request, message);
  }
}

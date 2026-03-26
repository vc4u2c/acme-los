import type { IssueCsrfTokenResponse } from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import {
  CSRF_COOKIE_NAME,
  createRandomToken,
  readSignedCookie,
  setSignedCookie,
} from './cookies';

type CsrfCookiePayload = {
  token: string;
};

export type IssuedCsrfToken = {
  cookiePayload: CsrfCookiePayload;
  response: IssueCsrfTokenResponse;
};

export function issueCsrfToken(request: NextRequest): IssuedCsrfToken {
  const existingCookie = readSignedCookie<CsrfCookiePayload>(
    request,
    CSRF_COOKIE_NAME,
  );
  const csrfToken = existingCookie?.token ?? createRandomToken();

  return {
    cookiePayload: { token: csrfToken },
    response: { csrfToken },
  };
}

export function writeCsrfToken(
  request: NextRequest,
  response: NextResponse,
  issuedToken: IssuedCsrfToken,
): void {
  setSignedCookie(
    response,
    request,
    CSRF_COOKIE_NAME,
    issuedToken.cookiePayload,
    {
      maxAge: 60 * 60 * 8,
    },
  );
}

export function assertValidCsrf(request: NextRequest): void {
  const headerToken = request.headers.get('x-csrf-token')?.trim();
  const cookiePayload = readSignedCookie<CsrfCookiePayload>(
    request,
    CSRF_COOKIE_NAME,
  );

  if (
    !headerToken ||
    !cookiePayload?.token ||
    headerToken !== cookiePayload.token
  ) {
    throw new Error('The request is missing a valid CSRF token.');
  }
}

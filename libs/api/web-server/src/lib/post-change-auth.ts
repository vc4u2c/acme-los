import type { NextRequest, NextResponse } from 'next/server';
import {
  clearCookie,
  parseSignedCookieValue,
  setSignedCookie,
} from './cookies';

export const POST_CHANGE_AUTH_COOKIE_NAME = 'acme-los.post-change-auth';
export const POST_CHANGE_AUTH_MAX_AGE_SECONDS = 10 * 60;

export type PostChangeAuthAction = 'email' | 'phone' | 'password';

export type PostChangeAuthIntent = {
  action: PostChangeAuthAction;
  expectedUserId: string;
  expiresAt: number;
};

function normalizePostChangeAuthIntent(
  intent: PostChangeAuthIntent | null,
): PostChangeAuthIntent | null {
  if (
    !intent ||
    !['email', 'phone', 'password'].includes(intent.action) ||
    typeof intent.expectedUserId !== 'string' ||
    intent.expectedUserId.trim().length === 0 ||
    !Number.isInteger(intent.expiresAt) ||
    intent.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return {
    ...intent,
    expectedUserId: intent.expectedUserId.trim(),
  };
}

export function parsePostChangeAuthIntent(
  rawCookieValue?: string,
): PostChangeAuthIntent | null {
  return normalizePostChangeAuthIntent(
    parseSignedCookieValue<PostChangeAuthIntent>(rawCookieValue),
  );
}

export function writePostChangeAuthIntent(
  request: NextRequest,
  response: NextResponse,
  intent: Omit<PostChangeAuthIntent, 'expiresAt'>,
): void {
  setSignedCookie(
    response,
    request,
    POST_CHANGE_AUTH_COOKIE_NAME,
    {
      ...intent,
      expiresAt:
        Math.floor(Date.now() / 1000) + POST_CHANGE_AUTH_MAX_AGE_SECONDS,
    },
    { maxAge: POST_CHANGE_AUTH_MAX_AGE_SECONDS },
  );
}

export function readPostChangeAuthIntent(
  request: NextRequest,
): PostChangeAuthIntent | null {
  return parsePostChangeAuthIntent(
    request.cookies.get(POST_CHANGE_AUTH_COOKIE_NAME)?.value,
  );
}

export function clearPostChangeAuthIntent(
  request: NextRequest,
  response: NextResponse,
): void {
  clearCookie(response, request, POST_CHANGE_AUTH_COOKIE_NAME);
}

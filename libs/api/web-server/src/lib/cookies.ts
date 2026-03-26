import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const AUTH_SESSION_COOKIE_NAME = 'acme-los.auth-session';
export const AUTH_LOGOUT_HINT_COOKIE_NAME = 'acme-los.auth-logout';
export const CUSTOMER_PROFILE_COOKIE_NAME = 'acme-los.customer-profile';
export const CSRF_COOKIE_NAME = 'acme-los.csrf-token';
export const APPLICATION_FLOW_COOKIE_NAME = 'acme-los.application-flow';

const DEV_SESSION_SECRET = 'acme-los-local-dev-session-secret';

type CookieShapeOptions = {
  httpOnly?: boolean;
  maxAge?: number;
};

function getCookieSecret(): string {
  const configuredSecret = process.env.ACME_WEB_SESSION_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_SESSION_SECRET;
  }

  throw new Error(
    'Set ACME_WEB_SESSION_SECRET before using the web session API in production.',
  );
}

function toBase64Url(value: Buffer | string): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;

  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalized.length % 4 === 0
      ? normalized
      : `${normalized}${'='.repeat(4 - (normalized.length % 4))}`;

  return Buffer.from(padded, 'base64');
}

function signValue(value: string): string {
  return toBase64Url(
    createHmac('sha256', getCookieSecret()).update(value).digest(),
  );
}

function isSecureRequest(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    request.nextUrl.protocol === 'https:'
  );
}

function buildCookieOptions(
  request: NextRequest,
  { httpOnly = true, maxAge }: CookieShapeOptions = {},
) {
  return {
    httpOnly,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: isSecureRequest(request),
  };
}

export function createRandomToken(): string {
  return toBase64Url(randomBytes(32));
}

export function parseSignedCookieValue<T>(rawCookieValue?: string): T | null {
  if (!rawCookieValue) {
    return null;
  }

  const [payloadPart, signaturePart] = rawCookieValue.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = signValue(payloadPart);
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualSignatureBuffer = Buffer.from(signaturePart, 'utf8');

  if (
    expectedSignatureBuffer.length !== actualSignatureBuffer.length ||
    !timingSafeEqual(expectedSignatureBuffer, actualSignatureBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function readSignedCookie<T>(
  request: NextRequest,
  cookieName: string,
): T | null {
  return parseSignedCookieValue<T>(request.cookies.get(cookieName)?.value);
}

export function setSignedCookie<T>(
  response: NextResponse,
  request: NextRequest,
  cookieName: string,
  payload: T,
  options?: CookieShapeOptions,
): void {
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = signValue(payloadPart);

  response.cookies.set({
    name: cookieName,
    value: `${payloadPart}.${signaturePart}`,
    ...buildCookieOptions(request, options),
  });
}

export function clearCookie(
  response: NextResponse,
  request: NextRequest,
  cookieName: string,
): void {
  response.cookies.set({
    name: cookieName,
    value: '',
    ...buildCookieOptions(request, { maxAge: 0 }),
  });
}

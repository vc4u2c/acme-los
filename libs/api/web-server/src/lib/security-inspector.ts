import type { WebAuthSession } from '@acme-los/api/contracts';
import type { NextRequest } from 'next/server';
import type { SessionCookiePayload } from './auth-session';
import type { WebAuthTransactionCookiePayload } from './auth-transaction-cookie';
import { readSessionCookiePayload } from './auth-session';
import {
  BFF_TRUSTED_PROXY_SECRET_HEADER,
  getBffBaseUrlOrThrow,
  getBffTrustedProxySecret,
} from './bff-config';
import { getBffServiceAuthorizationHeader } from './bff-service-auth';
import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_TRANSACTION_COOKIE_NAME,
} from './cookies';
import { getServerWebAuthConfig } from './config';
import { readWebAuthTransactionCookie } from './auth-transaction-cookie';
import { getWebStateStoreMode } from './state-store';

type SecurityInspectorTokenSnapshot = {
  raw: string | null;
  claims: Record<string, unknown> | null;
};

type SecurityInspectorStoredSessionSnapshot = {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  idleExpiresAt: number;
  session: WebAuthSession;
  tokens: {
    idToken: SecurityInspectorTokenSnapshot;
    accessToken: SecurityInspectorTokenSnapshot;
    refreshToken: string | null;
    tokenType?: string;
    scope?: string;
    expiresIn?: number;
  };
};

export type SecurityInspectorServerSnapshot = {
  provider: 'mock' | 'okta';
  stateStoreMode: 'file' | 'redis' | 'in-memory';
  configurationError?: string;
  generatedAt: string;
  requestCookies: Array<{ key: string; value: string }>;
  decodedCookies: {
    authSession: SessionCookiePayload | null;
    authTransaction: WebAuthTransactionCookiePayload | null;
  };
  storedSession: SecurityInspectorStoredSessionSnapshot | null;
};

function buildBffInspectorUrl(): URL {
  const baseUrl = getBffBaseUrlOrThrow();

  return new URL(
    '/bff/security/inspector',
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
  );
}

async function buildBffInspectorHeaders(
  request: NextRequest,
): Promise<Headers> {
  const headers = new Headers({
    accept: 'application/json',
  });

  for (const headerName of [
    'cookie',
    'user-agent',
    'x-correlation-id',
    'traceparent',
    'tracestate',
  ] as const) {
    const value = request.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set('x-forwarded-host', request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const trustedProxySecret = getBffTrustedProxySecret();
  if (trustedProxySecret) {
    headers.set(BFF_TRUSTED_PROXY_SECRET_HEADER, trustedProxySecret);
  }

  const authorizationHeader = await getBffServiceAuthorizationHeader();
  if (authorizationHeader) {
    headers.set('authorization', authorizationHeader);
  }

  return headers;
}

async function readBffSecurityInspectorServerSnapshot(
  request: NextRequest,
): Promise<SecurityInspectorServerSnapshot> {
  const response = await fetch(buildBffInspectorUrl(), {
    method: 'GET',
    headers: await buildBffInspectorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
      message?: unknown;
    } | null;
    const message =
      typeof body?.error === 'string'
        ? body.error
        : typeof body?.message === 'string'
          ? body.message
          : `The BFF security inspector returned ${response.status}.`;

    throw new Error(message);
  }

  return (await response.json()) as SecurityInspectorServerSnapshot;
}

export async function readSecurityInspectorServerSnapshot(
  request: NextRequest,
): Promise<SecurityInspectorServerSnapshot> {
  const authConfig = getServerWebAuthConfig();

  if (authConfig.provider !== 'mock') {
    return readBffSecurityInspectorServerSnapshot(request);
  }

  const authSessionCookie = request.cookies.get(
    AUTH_SESSION_COOKIE_NAME,
  )?.value;
  const authSessionCookiePayload = readSessionCookiePayload(authSessionCookie);

  return {
    provider: authConfig.provider,
    stateStoreMode: getWebStateStoreMode(),
    configurationError: authConfig.configurationError,
    generatedAt: new Date().toISOString(),
    requestCookies: request.cookies
      .getAll()
      .map((cookie) => ({
        key: cookie.name,
        value: cookie.value,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    decodedCookies: {
      authSession: authSessionCookiePayload,
      authTransaction: request.cookies.has(AUTH_TRANSACTION_COOKIE_NAME)
        ? readWebAuthTransactionCookie(request)
        : null,
    },
    storedSession: null,
  };
}

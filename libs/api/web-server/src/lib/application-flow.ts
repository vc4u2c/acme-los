import type {
  ApplicationStepKey,
  ApplicationStepState,
  GetApplicationStepResponse,
  WebAuthSession,
} from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  BFF_TRUSTED_PROXY_SECRET_HEADER,
  getBffBaseUrlOrThrow,
  getBffTrustedProxySecret,
} from './bff-config';
import { getBffServiceAuthorizationHeader } from './bff-service-auth';
import { APPLICATION_FLOW_COOKIE_NAME, clearCookie } from './cookies';

const BFF_AUTH_PROVIDER_HEADER = 'x-acme-auth-provider';
const BFF_AUTHENTICATED_USER_ID_HEADER = 'x-acme-authenticated-user-id';
const BFF_AUTHENTICATED_USER_EMAIL_HEADER = 'x-acme-authenticated-user-email';
const BFF_AUTHENTICATED_CUSTOMER_ID_HEADER = 'x-acme-authenticated-customer-id';
const BFF_AUTHENTICATED_LEAD_ID_HEADER = 'x-acme-authenticated-lead-id';

function buildBffUrl(path: string): URL {
  const baseUrl = getBffBaseUrlOrThrow();

  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function buildCookieHeader(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function setHeaderIfPresent(
  headers: Headers,
  headerName: string,
  value?: string,
): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    headers.set(headerName, trimmedValue);
  }
}

async function buildBffApplicationHeaders(
  session: WebAuthSession,
): Promise<Headers> {
  const cookieStore = await cookies();
  const headers = new Headers({
    accept: 'application/json',
    cookie: buildCookieHeader(cookieStore),
  });

  setHeaderIfPresent(headers, BFF_AUTH_PROVIDER_HEADER, session.provider);
  setHeaderIfPresent(
    headers,
    BFF_AUTHENTICATED_USER_ID_HEADER,
    session.user?.id,
  );
  setHeaderIfPresent(
    headers,
    BFF_AUTHENTICATED_USER_EMAIL_HEADER,
    session.user?.email,
  );
  setHeaderIfPresent(
    headers,
    BFF_AUTHENTICATED_CUSTOMER_ID_HEADER,
    session.user?.customerId,
  );
  setHeaderIfPresent(
    headers,
    BFF_AUTHENTICATED_LEAD_ID_HEADER,
    session.user?.leadId,
  );

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

export async function readServerApplicationStepState(
  session: WebAuthSession,
  step: ApplicationStepKey,
): Promise<ApplicationStepState | null> {
  if (session.provider === 'mock') {
    return null;
  }

  const response = await fetch(buildBffUrl(`/bff/application/steps/${step}`), {
    method: 'GET',
    headers: await buildBffApplicationHeaders(session),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GetApplicationStepResponse;

  return payload.stepState;
}

export async function clearApplicationFlow(
  _session: WebAuthSession,
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
}

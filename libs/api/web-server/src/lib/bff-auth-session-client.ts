import type {
  ClearWebAuthSessionResponse,
  CompleteAuthFlowResponse,
  CompleteIdxAuthFlowRequest,
  GetWebAuthSessionResponse,
  RequireWebAuthSessionRequest,
  RequireWebAuthSessionResponse,
  StartIdxAuthFlowRequest,
  StartIdxAuthFlowResponse,
  StartLogoutRequest,
  StartLogoutResponse,
  TouchWebAuthSessionResponse,
} from '@acme-los/api/contracts';
import type { NextRequest } from 'next/server';
import {
  BFF_TRUSTED_PROXY_SECRET_HEADER,
  getBffBaseUrlOrThrow,
  getBffTrustedProxySecret,
} from './bff-config';
import { getBffServiceAuthorizationHeader } from './bff-service-auth';

const AUTH_SESSION_ID_HEADER = 'x-acme-auth-session-id';
const AUTH_SESSION_MAX_AGE_HEADER = 'x-acme-auth-session-max-age';

type BffAuthRequestContext = {
  request?: NextRequest;
  cookieHeader?: string;
};

type BffJsonResponse<T> = {
  payload: T;
  headers: Headers;
};

type BffAuthMutation<T> = {
  storedSessionId: string;
  maxAge: number;
  response: T;
};

function trimValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildBffUrl(path: string): URL {
  const baseUrl = getBffBaseUrlOrThrow();

  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

async function buildBffAuthHeaders(
  context: BffAuthRequestContext,
  hasJsonBody: boolean,
): Promise<Headers> {
  const headers = new Headers({
    accept: 'application/json',
  });

  if (hasJsonBody) {
    headers.set('content-type', 'application/json');
  }

  const request = context.request;

  if (request) {
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
  }

  const cookieHeader = trimValue(context.cookieHeader);
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

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

async function fetchBffAuthJson<T>(
  path: string,
  options: BffAuthRequestContext & {
    allowStatus?: number[];
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
  },
): Promise<BffJsonResponse<T>> {
  const targetUrl = buildBffUrl(path);
  const hasJsonBody = options.body !== undefined;
  const response = await fetch(targetUrl, {
    method: options.method ?? 'GET',
    headers: await buildBffAuthHeaders(options, hasJsonBody),
    body: hasJsonBody ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  let payload: T;

  try {
    payload = (await response.json()) as T;
  } catch {
    throw new Error(
      `The BFF auth session endpoint returned ${response.status}.`,
    );
  }

  if (!response.ok && !options.allowStatus?.includes(response.status)) {
    const message =
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `The BFF auth session endpoint returned ${response.status}.`;

    throw new Error(message);
  }

  return {
    payload,
    headers: response.headers,
  };
}

function readBffMutationHeaders<T>(
  response: BffJsonResponse<T>,
): BffAuthMutation<T> {
  const storedSessionId = trimValue(
    response.headers.get(AUTH_SESSION_ID_HEADER),
  );
  const rawMaxAge = trimValue(
    response.headers.get(AUTH_SESSION_MAX_AGE_HEADER),
  );
  const maxAge = rawMaxAge ? Number(rawMaxAge) : Number.NaN;

  if (!storedSessionId || !Number.isInteger(maxAge) || maxAge <= 0) {
    throw new Error(
      'The BFF auth session response did not include session headers.',
    );
  }

  return {
    storedSessionId,
    maxAge,
    response: response.payload,
  };
}

export async function readBffWebAuthSession(
  context: BffAuthRequestContext,
): Promise<GetWebAuthSessionResponse> {
  return (
    await fetchBffAuthJson<GetWebAuthSessionResponse>(
      '/bff/auth/session',
      context,
    )
  ).payload;
}

export async function startBffIdxAuthFlow(
  request: NextRequest,
  payload: StartIdxAuthFlowRequest,
): Promise<StartIdxAuthFlowResponse> {
  return (
    await fetchBffAuthJson<StartIdxAuthFlowResponse>('/bff/auth/idx/start', {
      request,
      method: 'POST',
      body: payload,
    })
  ).payload;
}

export async function completeBffIdxAuthFlow(
  request: NextRequest,
  payload: CompleteIdxAuthFlowRequest,
): Promise<BffAuthMutation<CompleteAuthFlowResponse>> {
  return readBffMutationHeaders(
    await fetchBffAuthJson<CompleteAuthFlowResponse>('/bff/auth/idx/complete', {
      request,
      method: 'POST',
      body: payload,
    }),
  );
}

export async function startBffLogout(
  request: NextRequest,
  payload: StartLogoutRequest = {},
): Promise<StartLogoutResponse> {
  return (
    await fetchBffAuthJson<StartLogoutResponse>('/bff/auth/logout', {
      request,
      method: 'POST',
      body: payload,
    })
  ).payload;
}

export async function clearBffWebAuthSession(
  request: NextRequest,
): Promise<ClearWebAuthSessionResponse> {
  return (
    await fetchBffAuthJson<ClearWebAuthSessionResponse>('/bff/auth/session', {
      request,
      method: 'DELETE',
    })
  ).payload;
}

export async function touchBffWebAuthSession(
  request: NextRequest,
): Promise<BffAuthMutation<TouchWebAuthSessionResponse> | null> {
  const response = await fetchBffAuthJson<TouchWebAuthSessionResponse>(
    '/bff/auth/session/touch',
    {
      request,
      method: 'POST',
      allowStatus: [401],
    },
  );

  if (!response.payload.touched) {
    return null;
  }

  return readBffMutationHeaders(response);
}

export async function requireBffWebAuthSession(
  context: BffAuthRequestContext,
  requirement: RequireWebAuthSessionRequest,
): Promise<RequireWebAuthSessionResponse> {
  return (
    await fetchBffAuthJson<RequireWebAuthSessionResponse>(
      '/bff/auth/session/requirement',
      {
        ...context,
        method: 'POST',
        body: requirement,
      },
    )
  ).payload;
}

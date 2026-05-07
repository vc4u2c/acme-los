import type {
  ClearWebAuthSessionResponse,
  CompleteAuthFlowResponse,
  GetWebAuthLogoutHintResponse,
  GetWebAuthSessionResponse,
  RequireWebAuthSessionRequest,
  RequireWebAuthSessionResponse,
  StartAuthFlowResponse,
  StartLogoutResponse,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  TouchWebAuthSessionResponse,
  WebAuthStepUpRequirement,
} from '@acme-los/api/contracts';
import type { NextRequest } from 'next/server';
import {
  BFF_TRUSTED_PROXY_SECRET_HEADER,
  getBffBaseUrlOrThrow,
  getBffTrustedProxySecret,
} from './bff-config';

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

function buildBffAuthHeaders(
  context: BffAuthRequestContext,
  hasJsonBody: boolean,
): Headers {
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
    headers: buildBffAuthHeaders(options, hasJsonBody),
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
  options: { includeDebug?: boolean } = {},
): Promise<GetWebAuthSessionResponse> {
  const query = options.includeDebug ? '?includeDebug=1' : '';

  return (
    await fetchBffAuthJson<GetWebAuthSessionResponse>(
      `/bff/auth/session${query}`,
      context,
    )
  ).payload;
}

export async function syncBffWebAuthSession(
  request: NextRequest,
  payload: SyncWebAuthSessionRequest,
): Promise<BffAuthMutation<SyncWebAuthSessionResponse>> {
  return readBffMutationHeaders(
    await fetchBffAuthJson<SyncWebAuthSessionResponse>('/bff/auth/session', {
      request,
      method: 'POST',
      body: payload,
    }),
  );
}

export async function startBffAuthFlow(
  request: NextRequest,
  options: {
    returnTo?: string;
    minimumAssuranceLevel?: 'aal1' | 'aal2';
    expectedUserId?: string;
    leadId?: string;
    stepUp?: WebAuthStepUpRequirement;
  },
): Promise<StartAuthFlowResponse> {
  const searchParams = new URLSearchParams();

  if (options.returnTo) {
    searchParams.set('returnTo', options.returnTo);
  }

  if (options.minimumAssuranceLevel) {
    searchParams.set('aal', options.minimumAssuranceLevel);
  }

  if (options.expectedUserId) {
    searchParams.set('expectedUserId', options.expectedUserId);
  }

  if (options.leadId) {
    searchParams.set('leadId', options.leadId);
  }

  if (options.stepUp) {
    searchParams.set('stepUpReason', options.stepUp.reason);
    searchParams.set(
      'stepUpMaxAgeSeconds',
      String(options.stepUp.maxAgeSeconds),
    );
    searchParams.set(
      'stepUpConsumeOnSatisfied',
      options.stepUp.consumeOnSatisfied ? 'true' : 'false',
    );
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return (
    await fetchBffAuthJson<StartAuthFlowResponse>(`/bff/auth/login${query}`, {
      request,
    })
  ).payload;
}

export async function completeBffAuthCallback(
  request: NextRequest,
  query: {
    code: string;
    state: string;
  },
): Promise<BffAuthMutation<CompleteAuthFlowResponse>> {
  const searchParams = new URLSearchParams({
    code: query.code,
    state: query.state,
  });

  return readBffMutationHeaders(
    await fetchBffAuthJson<CompleteAuthFlowResponse>(
      `/bff/auth/callback?${searchParams.toString()}`,
      {
        request,
      },
    ),
  );
}

export async function startBffLogout(
  request: NextRequest,
): Promise<StartLogoutResponse> {
  return (
    await fetchBffAuthJson<StartLogoutResponse>('/bff/auth/logout', {
      request,
      method: 'POST',
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

export async function readBffLogoutHintIdToken(
  request: NextRequest,
): Promise<string | null> {
  return (
    await fetchBffAuthJson<GetWebAuthLogoutHintResponse>(
      '/bff/auth/logout-hint',
      {
        request,
      },
    )
  ).payload.idToken;
}

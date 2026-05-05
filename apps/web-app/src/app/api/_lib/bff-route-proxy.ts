import { NextRequest, NextResponse } from 'next/server';

const BFF_BASE_URL_ENV_NAMES = ['ACME_BFF_BASE_URL', 'ACME_BFF_URL'] as const;
const BFF_TRUSTED_PROXY_SECRET_HEADER = 'x-acme-bff-proxy-secret';
const BFF_TRUSTED_PROXY_SECRET_ENV_NAME = 'ACME_BFF_TRUSTED_PROXY_SECRET';

const REQUEST_HEADERS_TO_FORWARD = [
  'accept',
  'content-type',
  'cookie',
  'user-agent',
  'x-correlation-id',
  'x-csrf-token',
  'traceparent',
  'tracestate',
] as const;

const RESPONSE_HEADERS_TO_SKIP = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

export interface BffProxyOptions {
  extraHeaders?: Record<string, string | null | undefined>;
}

function trimValue(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getBffBaseUrl(): string | null {
  for (const envName of BFF_BASE_URL_ENV_NAMES) {
    const value = trimValue(process.env[envName]);
    if (value) {
      return value;
    }
  }

  return null;
}

function buildProxyTargetUrl(
  request: NextRequest,
  upstreamPath: string,
  baseUrl: string,
): URL {
  const targetUrl = new URL(
    upstreamPath,
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
  );
  targetUrl.search = request.nextUrl.search;
  return targetUrl;
}

function buildUpstreamHeaders(
  request: NextRequest,
  extraHeaders?: Record<string, string | null | undefined>,
): Headers {
  const headers = new Headers();

  for (const headerName of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set('x-forwarded-host', request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const trustedProxySecret = trimValue(
    process.env[BFF_TRUSTED_PROXY_SECRET_ENV_NAME],
  );

  if (trustedProxySecret) {
    headers.set(BFF_TRUSTED_PROXY_SECRET_HEADER, trustedProxySecret);
  }

  for (const [headerName, value] of Object.entries(extraHeaders ?? {})) {
    const trimmedValue = trimValue(value ?? undefined);

    if (trimmedValue) {
      headers.set(headerName, trimmedValue);
    }
  }

  return headers;
}

async function toNextResponse(
  upstreamResponse: Response,
): Promise<NextResponse> {
  const headers = new Headers();

  upstreamResponse.headers.forEach((value, key) => {
    if (!RESPONSE_HEADERS_TO_SKIP.has(key.toLowerCase())) {
      headers.append(key, value);
    }
  });

  const body =
    upstreamResponse.status === 204 || upstreamResponse.status === 304
      ? null
      : new Uint8Array(await upstreamResponse.arrayBuffer());

  return new NextResponse(body, {
    status: upstreamResponse.status,
    headers,
  });
}

export async function maybeProxyToBff(
  request: NextRequest,
  upstreamPath: string,
  options: BffProxyOptions = {},
): Promise<NextResponse | null> {
  const baseUrl = getBffBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const targetUrl = buildProxyTargetUrl(request, upstreamPath, baseUrl);
  const rawBody =
    request.method === 'GET' || request.method === 'HEAD'
      ? null
      : await request.text();

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: buildUpstreamHeaders(request, options.extraHeaders),
    body: rawBody && rawBody.length > 0 ? rawBody : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  return toNextResponse(upstreamResponse);
}

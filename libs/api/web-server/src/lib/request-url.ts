import type { NextRequest } from 'next/server';

function getFirstForwardedValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);

  return first ?? null;
}

export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost =
    getFirstForwardedValue(request.headers.get('x-forwarded-host')) ??
    getFirstForwardedValue(request.headers.get('host'));
  const forwardedProto =
    getFirstForwardedValue(request.headers.get('x-forwarded-proto')) ??
    request.nextUrl.protocol.replace(/:$/, '');

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function buildPublicRequestUrl(
  request: NextRequest,
  pathnameOrUrl: string,
): URL {
  return new URL(pathnameOrUrl, `${getRequestOrigin(request)}/`);
}

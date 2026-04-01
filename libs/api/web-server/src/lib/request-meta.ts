import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

export function getRequestClientAddress(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.trim();

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

export function getRequestUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent')?.trim() || 'unknown';
}

export function getRequestFingerprint(
  request: NextRequest,
  namespace: string,
): string {
  return createHash('sha256')
    .update(
      [
        namespace,
        getRequestClientAddress(request),
        getRequestUserAgent(request),
      ].join('|'),
    )
    .digest('hex');
}

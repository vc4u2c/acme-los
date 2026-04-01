import type { NextRequest, NextResponse } from 'next/server';
import { readStateValue, writeStateValue } from './state-store';
import { getRequestFingerprint } from './request-meta';

const RATE_LIMIT_NAMESPACE = 'rate-limit';

type StoredRateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitPolicy = {
  namespace: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

function getRateLimitKey(
  request: NextRequest,
  policy: RateLimitPolicy,
): string {
  return `${policy.namespace}:${getRequestFingerprint(request, policy.namespace)}`;
}

function getWindowResetAt(windowSeconds: number): number {
  return Date.now() + windowSeconds * 1000;
}

export async function checkRateLimit(
  request: NextRequest,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const key = getRateLimitKey(request, policy);
  const currentEpochMilliseconds = Date.now();
  const existingBucket = await readStateValue<StoredRateLimitBucket>(
    RATE_LIMIT_NAMESPACE,
    key,
  );

  if (!existingBucket || existingBucket.resetAt <= currentEpochMilliseconds) {
    const resetAt = getWindowResetAt(policy.windowSeconds);

    await writeStateValue(
      RATE_LIMIT_NAMESPACE,
      key,
      {
        count: 1,
        resetAt,
      },
      policy.windowSeconds,
    );

    return {
      allowed: true,
      limit: policy.limit,
      remaining: Math.max(policy.limit - 1, 0),
      retryAfterSeconds: policy.windowSeconds,
      resetAt,
    };
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((existingBucket.resetAt - currentEpochMilliseconds) / 1000),
    1,
  );

  if (existingBucket.count >= policy.limit) {
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      retryAfterSeconds,
      resetAt: existingBucket.resetAt,
    };
  }

  const nextCount = existingBucket.count + 1;

  await writeStateValue(
    RATE_LIMIT_NAMESPACE,
    key,
    {
      count: nextCount,
      resetAt: existingBucket.resetAt,
    },
    retryAfterSeconds,
  );

  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(policy.limit - nextCount, 0),
    retryAfterSeconds,
    resetAt: existingBucket.resetAt,
  };
}

export function applyRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): void {
  response.headers.set('x-ratelimit-limit', String(result.limit));
  response.headers.set('x-ratelimit-remaining', String(result.remaining));
  response.headers.set(
    'x-ratelimit-reset',
    String(Math.ceil(result.resetAt / 1000)),
  );

  if (!result.allowed) {
    response.headers.set('retry-after', String(result.retryAfterSeconds));
  }
}

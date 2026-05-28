import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
} from '@acme-los/api/web-server';
import { createConsoleLogger, createTraceLogger } from '@acme-los/core/logger';
import {
  correlationIdHeaderName,
  createTraceparentHeader,
  parseInboundTraceContext,
  traceparentHeaderName,
} from '@acme-los/core/logger/trace-context';
import { maybeProxyToBff } from '../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

const logger = createConsoleLogger();
const diagnosticsTraceRoute = '/api/diagnostics/trace';
const bffDiagnosticsTraceRoute = '/bff/diagnostics/trace';

const diagnosticsTraceRateLimitPolicy = {
  namespace: 'diagnostics-trace',
  limit: 12,
  windowSeconds: 60,
} as const;

function createServerSpanId(): string {
  let spanId = '';

  do {
    spanId = randomBytes(8).toString('hex');
  } while (spanId === '0000000000000000');

  return spanId;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const acceptedAt = new Date().toISOString();
  let correlationId: string | undefined;
  let traceId: string | undefined;

  try {
    const rateLimit = await checkRateLimit(
      request,
      diagnosticsTraceRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { message: 'Too many diagnostic trace requests.' },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logger.warn('Diagnostic trace rate limit exceeded.', {
        event: 'diagnostics.trace.rate_limited',
        route: diagnosticsTraceRoute,
      });

      return response;
    }

    assertValidCsrf(request);

    const traceContext = parseInboundTraceContext({
      correlationId: request.headers.get(correlationIdHeaderName),
      traceparent: request.headers.get(traceparentHeaderName),
    });

    if (!traceContext) {
      return NextResponse.json(
        {
          message:
            'Valid W3C traceparent and X-Correlation-ID headers are required.',
        },
        { status: 400 },
      );
    }

    correlationId = traceContext.correlationId;
    traceId = traceContext.traceId;
    const nextSpanId = createServerSpanId();
    const nextTraceparent = createTraceparentHeader({
      traceId: traceContext.traceId,
      spanId: nextSpanId,
      traceFlags: traceContext.traceFlags,
    });
    const traceLogger = createTraceLogger(logger, {
      correlationId,
      traceId: traceContext.traceId,
      traceFlags: traceContext.traceFlags,
      incomingTraceparent: traceContext.traceparent,
      traceparent: nextTraceparent,
      parentSpanId: traceContext.parentSpanId,
      spanId: nextSpanId,
      route: diagnosticsTraceRoute,
      downstreamRoute: bffDiagnosticsTraceRoute,
      handledBy: 'next-facade',
    });

    traceLogger.event(
      'info',
      'diagnostics.trace.next.forwarded',
      'Forwarded diagnostic trace API call from Next facade to BFF.',
      {
        acceptedAt,
      },
    );

    const proxiedResponse = await maybeProxyToBff(
      request,
      bffDiagnosticsTraceRoute,
      {
        extraHeaders: {
          [traceparentHeaderName]: nextTraceparent,
        },
      },
    );

    if (!proxiedResponse) {
      const response = NextResponse.json(
        { message: 'BFF diagnostic tracing is not configured.' },
        {
          status: 503,
          headers: {
            [correlationIdHeaderName]: correlationId,
          },
        },
      );

      applyRateLimitHeaders(response, rateLimit);
      return response;
    }

    applyRateLimitHeaders(proxiedResponse, rateLimit);
    return proxiedResponse;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to run diagnostic trace.';

    logger.error('Diagnostic trace failed.', {
      event: 'diagnostics.trace.failure',
      correlationId,
      route: diagnosticsTraceRoute,
      traceId,
      acceptedAt,
      error: message,
    });

    return NextResponse.json(
      { message: 'Unable to run diagnostic trace.' },
      { status: 400 },
    );
  }
}

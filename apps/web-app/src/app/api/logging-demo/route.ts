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
import { z } from 'zod';

export const runtime = 'nodejs';

const logger = createConsoleLogger();
const loggingDemoRoute = '/logging-demo';

const loggingDemoRateLimitPolicy = {
  namespace: 'logging-demo',
  limit: 20,
  windowSeconds: 60,
} as const;

const boundedText = (maxLength: number) => z.string().trim().max(maxLength);

const clientTelemetrySchema = z.object({
  emittedAt: boundedText(64),
  pageUrl: boundedText(512),
  referrer: boundedText(512).optional(),
  userAgent: boundedText(512),
  language: boundedText(64),
  languages: z.array(boundedText(64)).max(8),
  timeZone: boundedText(128),
  visibilityState: z.enum(['hidden', 'visible', 'prerender', 'unloaded']),
  hardwareConcurrency: z.number().int().min(0).max(256).optional(),
  deviceMemory: z.number().min(0).max(1024).optional(),
  viewport: z.object({
    width: z.number().int().min(0).max(20_000),
    height: z.number().int().min(0).max(20_000),
  }),
  screen: z.object({
    width: z.number().int().min(0).max(20_000),
    height: z.number().int().min(0).max(20_000),
    colorDepth: z.number().int().min(0).max(128),
    pixelRatio: z.number().min(0).max(20),
  }),
  connection: z
    .object({
      effectiveType: boundedText(32).optional(),
      downlink: z.number().min(0).max(100_000).optional(),
      rtt: z.number().int().min(0).max(120_000).optional(),
      saveData: z.boolean().optional(),
    })
    .optional(),
});

const clientErrorSchema = z.object({
  name: boundedText(128),
  message: boundedText(512),
});

const tracedClientToServerRequestSchema = z.object({
  action: z.literal('traced-client-to-server'),
  clientTelemetry: clientTelemetrySchema,
});

const serverEventRequestSchema = z.object({
  action: z.literal('server-event'),
});

const clientErrorRequestSchema = z.object({
  action: z.literal('client-error'),
  clientTelemetry: clientTelemetrySchema,
  clientError: clientErrorSchema,
});

const serverErrorRequestSchema = z.object({
  action: z.literal('server-error'),
});

const loggingDemoRequestSchema = z.discriminatedUnion('action', [
  tracedClientToServerRequestSchema,
  serverEventRequestSchema,
  clientErrorRequestSchema,
  serverErrorRequestSchema,
]);

type LoggingDemoResponse = {
  acceptedAt: string;
  correlationId: string;
  event: string;
  events: string[];
  parentSpanId: string;
  serverTraceparent: string;
  spanId: string;
  traceId: string;
  traceparent: string;
};

function createLoggingDemoResponse({
  acceptedAt,
  correlationId,
  events,
  parentSpanId,
  serverTraceparent,
  spanId,
  traceId,
  traceparent,
}: {
  acceptedAt: string;
  correlationId: string;
  events: string[];
  parentSpanId: string;
  serverTraceparent: string;
  spanId: string;
  traceId: string;
  traceparent: string;
}): LoggingDemoResponse {
  return {
    acceptedAt,
    correlationId,
    event: events[events.length - 1] ?? 'logging.demo.unknown',
    events,
    parentSpanId,
    serverTraceparent,
    spanId,
    traceId,
    traceparent,
  };
}

function serializeServerError(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: 'Error',
    message: 'Unknown server error.',
  };
}

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
    const rateLimit = await checkRateLimit(request, loggingDemoRateLimitPolicy);

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { message: 'Too many logging demo events.' },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logger.warn('Logging demo rate limit exceeded.', {
        event: 'logging.demo.rate_limited',
        route: loggingDemoRoute,
      });

      return response;
    }

    assertValidCsrf(request);

    const payload = loggingDemoRequestSchema.parse(await request.json());
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
    const spanId = createServerSpanId();
    const serverTraceparent = createTraceparentHeader({
      traceId: traceContext.traceId,
      spanId,
      traceFlags: traceContext.traceFlags,
    });
    traceId = traceContext.traceId;

    const traceLogger = createTraceLogger(logger, {
      correlationId,
      traceId: traceContext.traceId,
      traceFlags: traceContext.traceFlags,
      incomingTraceparent: traceContext.traceparent,
      traceparent: serverTraceparent,
      parentSpanId: traceContext.parentSpanId,
      spanId,
      route: loggingDemoRoute,
      action: payload.action,
    });

    const events = {
      'traced-client-to-server': [
        'logging.demo.client.received',
        'logging.demo.server.processed',
      ],
      'server-event': ['logging.demo.server.manual'],
      'client-error': ['logging.demo.client.error.received'],
      'server-error': ['logging.demo.server.error'],
    }[payload.action];

    if (payload.action === 'traced-client-to-server') {
      traceLogger.event(
        'info',
        'logging.demo.client.received',
        'Received browser telemetry for logging demo trace.',
        {
          acceptedAt,
          clientTelemetry: payload.clientTelemetry,
        },
      );

      traceLogger.event(
        'info',
        'logging.demo.server.processed',
        'Processed logging demo trace on the server.',
        {
          acceptedAt,
        },
      );
    } else if (payload.action === 'client-error') {
      traceLogger.event(
        'error',
        'logging.demo.client.error.received',
        'Received controlled client-side logging demo error.',
        {
          acceptedAt,
          clientError: payload.clientError,
          clientTelemetry: payload.clientTelemetry,
        },
      );
    } else if (payload.action === 'server-error') {
      try {
        throw new Error('Controlled logging demo server error.');
      } catch (error) {
        traceLogger.event(
          'error',
          'logging.demo.server.error',
          'Captured controlled server-side logging demo error.',
          {
            acceptedAt,
            error: serializeServerError(error),
          },
        );
      }
    } else {
      traceLogger.event(
        'info',
        'logging.demo.server.manual',
        'Emitted server-only logging demo event.',
        {
          acceptedAt,
        },
      );
    }

    const response = NextResponse.json(
      createLoggingDemoResponse({
        acceptedAt,
        correlationId,
        events,
        parentSpanId: traceContext.parentSpanId,
        serverTraceparent,
        spanId,
        traceId: traceContext.traceId,
        traceparent: traceContext.traceparent,
      }),
      {
        headers: {
          'cache-control': 'no-store, max-age=0',
          [correlationIdHeaderName]: correlationId,
        },
      },
    );

    applyRateLimitHeaders(response, rateLimit);

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to write logging demo event.';

    logger.error('Logging demo event failed.', {
      event: 'logging.demo.failure',
      correlationId,
      route: loggingDemoRoute,
      traceId,
      acceptedAt,
      error: message,
    });

    return NextResponse.json(
      { message: 'Unable to write logging demo event.' },
      { status: 400 },
    );
  }
}

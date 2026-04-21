import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  assertValidCsrf,
  checkRateLimit,
} from '@acme-los/api/web-server';
import { createConsoleLogger, createTraceLogger } from '@acme-los/core/logger';
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

const tracedClientToServerRequestSchema = z.object({
  action: z.literal('traced-client-to-server'),
  traceId: z.string().uuid(),
  clientTelemetry: clientTelemetrySchema,
});

const serverEventRequestSchema = z.object({
  action: z.literal('server-event'),
  traceId: z.string().uuid(),
});

const loggingDemoRequestSchema = z.discriminatedUnion('action', [
  tracedClientToServerRequestSchema,
  serverEventRequestSchema,
]);

type LoggingDemoResponse = {
  acceptedAt: string;
  event: string;
  events: string[];
  traceId: string;
};

function createLoggingDemoResponse({
  acceptedAt,
  events,
  traceId,
}: {
  acceptedAt: string;
  events: string[];
  traceId: string;
}): LoggingDemoResponse {
  return {
    acceptedAt,
    event: events[events.length - 1] ?? 'logging.demo.unknown',
    events,
    traceId,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const acceptedAt = new Date().toISOString();
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
    traceId = payload.traceId;

    const traceLogger = createTraceLogger(logger, {
      traceId: payload.traceId,
      route: loggingDemoRoute,
      action: payload.action,
    });

    const events =
      payload.action === 'traced-client-to-server'
        ? ['logging.demo.client.received', 'logging.demo.server.processed']
        : ['logging.demo.server.manual'];

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
        events,
        traceId: payload.traceId,
      }),
      {
        headers: {
          'cache-control': 'no-store, max-age=0',
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
      route: loggingDemoRoute,
      traceId,
      acceptedAt,
      error: message,
    });

    return NextResponse.json({ message }, { status: 400 });
  }
}

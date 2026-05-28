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
import {
  showcaseGridOfficerOptions,
  showcaseGridProductOptions,
  showcaseGridRegionOptions,
  showcaseGridRiskGradeOptions,
  showcaseGridStatusOptions,
} from '../../../../lib/showcase-grid';

export const runtime = 'nodejs';

const logger = createConsoleLogger();
const observabilityEventsRoute = '/api/observability/events';

const observabilityEventsRateLimitPolicy = {
  namespace: 'observability-events',
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

const browserTelemetryEventSchema = z.object({
  eventName: z.literal('logging.demo.client.received'),
  route: boundedText(256),
  clientTelemetry: clientTelemetrySchema,
});

const serverManualEventSchema = z.object({
  eventName: z.literal('logging.demo.server.manual'),
  route: boundedText(256),
});

const clientErrorEventSchema = z.object({
  eventName: z.literal('logging.demo.client.error.received'),
  route: boundedText(256),
  clientTelemetry: clientTelemetrySchema,
  clientError: clientErrorSchema,
});

const serverErrorEventSchema = z.object({
  eventName: z.literal('logging.demo.server.error'),
  route: boundedText(256),
});

const showcaseGridDemoTextSchema = (maxLength: number) =>
  boundedText(maxLength).regex(/^[a-zA-Z0-9 .&'-]+$/);

const showcaseGridSubmittedRowSchema = z.object({
  amount: z.number().int().min(25_000).max(5_000_000),
  borrower: showcaseGridDemoTextSchema(80),
  id: boundedText(32).regex(/^GRID-\d{4}$/),
  ltv: z.number().int().min(0).max(100),
  officer: z.enum(showcaseGridOfficerOptions),
  product: z.enum(showcaseGridProductOptions),
  rate: z.number().min(0).max(30),
  region: z.enum(showcaseGridRegionOptions),
  riskGrade: z.enum(showcaseGridRiskGradeOptions),
  status: z.enum(showcaseGridStatusOptions),
});

const showcaseGridSubmitEventSchema = z.object({
  eventName: z.literal('showcase.grid.submit'),
  route: boundedText(256),
  gridSubmission: z.object({
    deletedRowIds: z.array(boundedText(32).regex(/^GRID-\d{4}$/)).max(50),
    editedRows: z.array(showcaseGridSubmittedRowSchema).max(25),
    submittedAt: boundedText(64),
    visibleQuery: z.object({
      filter: boundedText(80),
      pageIndex: z.number().int().min(0).max(100),
      pageSize: z.number().int().min(5).max(25),
      sorting: z
        .array(
          z.object({
            desc: z.boolean(),
            id: boundedText(64),
          }),
        )
        .max(1),
      status: z
        .union([z.literal('all'), z.enum(showcaseGridStatusOptions)])
        .default('all'),
    }),
  }),
});

const observabilityEventRequestSchema = z.discriminatedUnion('eventName', [
  browserTelemetryEventSchema,
  serverManualEventSchema,
  clientErrorEventSchema,
  serverErrorEventSchema,
  showcaseGridSubmitEventSchema,
]);

type ObservabilityEventResponse = {
  acceptedAt: string;
  correlationId: string;
  emittedEvents: string[];
  eventName: string;
  handledBy: string;
  incomingTraceparent: string;
  parentSpanId: string;
  route: string;
  serverSpanId: string;
  serverTraceparent: string;
  traceId: string;
  traceFlags: string;
};

function createObservabilityEventResponse({
  acceptedAt,
  correlationId,
  emittedEvents,
  eventName,
  handledBy,
  incomingTraceparent,
  parentSpanId,
  route,
  serverSpanId,
  serverTraceparent,
  traceFlags,
  traceId,
}: ObservabilityEventResponse): ObservabilityEventResponse {
  return {
    acceptedAt,
    correlationId,
    emittedEvents,
    eventName,
    handledBy,
    incomingTraceparent,
    parentSpanId,
    route,
    serverSpanId,
    serverTraceparent,
    traceFlags,
    traceId,
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
    const rateLimit = await checkRateLimit(
      request,
      observabilityEventsRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { message: 'Too many observability events.' },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logger.warn('Observability events rate limit exceeded.', {
        event: 'observability.events.rate_limited',
        route: observabilityEventsRoute,
      });

      return response;
    }

    assertValidCsrf(request);

    const payload = observabilityEventRequestSchema.parse(await request.json());
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
    const serverSpanId = createServerSpanId();
    const serverTraceparent = createTraceparentHeader({
      traceId: traceContext.traceId,
      spanId: serverSpanId,
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
      spanId: serverSpanId,
      route: payload.route,
      observabilityEndpoint: observabilityEventsRoute,
      requestedEvent: payload.eventName,
      handledBy: 'next-facade',
    });

    let emittedEvents: string[];

    if (payload.eventName === 'logging.demo.client.received') {
      emittedEvents = [
        'logging.demo.client.received',
        'logging.demo.server.processed',
      ];

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
    } else if (payload.eventName === 'logging.demo.client.error.received') {
      emittedEvents = ['logging.demo.client.error.received'];

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
    } else if (payload.eventName === 'logging.demo.server.error') {
      emittedEvents = ['logging.demo.server.error'];

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
    } else if (payload.eventName === 'showcase.grid.submit') {
      emittedEvents = ['showcase.grid.submit'];

      traceLogger.event(
        'info',
        'showcase.grid.submit',
        'Received bounded showcase grid edit submission.',
        {
          acceptedAt,
          gridSubmission: payload.gridSubmission,
        },
      );
    } else {
      emittedEvents = ['logging.demo.server.manual'];

      traceLogger.event(
        'info',
        'logging.demo.server.manual',
        'Emitted API-handled logging demo event.',
        {
          acceptedAt,
        },
      );
    }

    const response = NextResponse.json(
      createObservabilityEventResponse({
        acceptedAt,
        correlationId,
        emittedEvents,
        eventName: payload.eventName,
        handledBy: 'next-facade',
        incomingTraceparent: traceContext.traceparent,
        parentSpanId: traceContext.parentSpanId,
        route: payload.route,
        serverSpanId,
        serverTraceparent,
        traceFlags: traceContext.traceFlags,
        traceId: traceContext.traceId,
      }),
      {
        status: 202,
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
        : 'Unable to write observability event.';

    logger.error('Observability event failed.', {
      event: 'observability.events.failure',
      correlationId,
      route: observabilityEventsRoute,
      traceId,
      acceptedAt,
      error: message,
    });

    return NextResponse.json(
      { message: 'Unable to write observability event.' },
      { status: 400 },
    );
  }
}

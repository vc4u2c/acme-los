export const correlationIdHeaderName = 'x-correlation-id';
export const traceparentHeaderName = 'traceparent';

export type TraceParentContext = {
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
  traceparent: string;
};

export type InboundTraceContext = TraceParentContext & {
  correlationId: string;
};

const traceparentPattern =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCorrelationIdHeader(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!correlationIdPattern.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

export function parseTraceparentHeader(
  value: string | null | undefined,
): TraceParentContext | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  const match = traceparentPattern.exec(normalizedValue);

  if (!match) {
    return null;
  }

  const [, version, traceId, parentSpanId, traceFlags] = match;

  if (
    version === 'ff' ||
    traceId === '00000000000000000000000000000000' ||
    parentSpanId === '0000000000000000'
  ) {
    return null;
  }

  return {
    traceId,
    parentSpanId,
    traceFlags,
    traceparent: normalizedValue,
  };
}

export function parseInboundTraceContext({
  correlationId,
  traceparent,
}: {
  correlationId: string | null | undefined;
  traceparent: string | null | undefined;
}): InboundTraceContext | null {
  const parsedCorrelationId = parseCorrelationIdHeader(correlationId);
  const parsedTraceparent = parseTraceparentHeader(traceparent);

  if (!parsedCorrelationId || !parsedTraceparent) {
    return null;
  }

  return {
    ...parsedTraceparent,
    correlationId: parsedCorrelationId,
  };
}

export function createTraceparentHeader({
  traceId,
  spanId,
  traceFlags,
}: {
  traceId: string;
  spanId: string;
  traceFlags: string;
}): string {
  return `00-${traceId}-${spanId}-${traceFlags}`;
}

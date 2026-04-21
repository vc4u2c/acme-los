import {
  correlationIdHeaderName,
  createTraceparentHeader,
  parseInboundTraceContext,
  parseTraceparentHeader,
  traceparentHeaderName,
} from '@acme-los/core/logger/trace-context';

const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
const parentSpanId = '00f067aa0ba902b7';
const spanId = 'a416768db2214d6e';
const traceFlags = '01';
const traceparent = `00-${traceId}-${parentSpanId}-${traceFlags}`;
const correlationId = '931f0597-d984-42e3-a652-e64fe3b719ef';

describe('trace context helpers', () => {
  it('normalizes valid W3C traceparent and correlation headers', () => {
    expect(
      parseInboundTraceContext({
        correlationId: correlationId.toUpperCase(),
        traceparent: traceparent.toUpperCase(),
      }),
    ).toEqual({
      correlationId,
      traceFlags,
      traceId,
      parentSpanId,
      traceparent,
    });
  });

  it('rejects invalid W3C traceparent values', () => {
    expect(
      parseTraceparentHeader(`ff-${traceId}-${parentSpanId}-${traceFlags}`),
    ).toBeNull();
    expect(
      parseTraceparentHeader(
        `00-00000000000000000000000000000000-${parentSpanId}-${traceFlags}`,
      ),
    ).toBeNull();
    expect(
      parseTraceparentHeader(`00-${traceId}-0000000000000000-${traceFlags}`),
    ).toBeNull();
    expect(parseTraceparentHeader('not-a-traceparent')).toBeNull();
  });

  it('creates the traceparent value used for the current server span', () => {
    expect(createTraceparentHeader({ traceId, spanId, traceFlags })).toBe(
      `00-${traceId}-${spanId}-${traceFlags}`,
    );
  });

  it('keeps the standard header names centralized', () => {
    expect(traceparentHeaderName).toBe('traceparent');
    expect(correlationIdHeaderName).toBe('x-correlation-id');
  });
});

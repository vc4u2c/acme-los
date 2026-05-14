/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/observability/events/route';

const correlationId = '931f0597-d984-42e3-a652-e64fe3b719ef';
const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
let requestAddressSuffix = 0;

function createTelemetryRequest(headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://los.example.test/api/observability/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'acme-los.csrf-token=csrf-token-123',
      traceparent,
      'user-agent': 'jest',
      'x-correlation-id': correlationId,
      'x-csrf-token': 'csrf-token-123',
      'x-forwarded-for': `203.0.113.${++requestAddressSuffix}`,
      ...headers,
    },
    body: JSON.stringify({
      eventName: 'logging.demo.server.manual',
      route: '/logging-demo',
    }),
  });
}

describe('observability events route', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalProxyMode = process.env.ACME_BFF_PROXY_MODE;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalObservabilityToggle =
    process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.ACME_BFF_BASE_URL;
    } else {
      process.env.ACME_BFF_BASE_URL = originalBaseUrl;
    }

    if (originalProxyMode === undefined) {
      delete process.env.ACME_BFF_PROXY_MODE;
    } else {
      process.env.ACME_BFF_PROXY_MODE = originalProxyMode;
    }

    if (originalTrustedProxySecret === undefined) {
      delete process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
    } else {
      process.env.ACME_BFF_TRUSTED_PROXY_SECRET = originalTrustedProxySecret;
    }

    if (originalObservabilityToggle === undefined) {
      delete process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED;
    } else {
      process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED =
        originalObservabilityToggle;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps observability ingestion on the Next facade when the BFF telemetry toggle is off', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED = 'false';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await POST(createTelemetryRequest());
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
    expect(payload.eventName).toBe('logging.demo.server.manual');
    expect(payload.route).toBe('/logging-demo');
  });

  it('delegates observability ingestion to the BFF when BFF mode and the telemetry toggle are enabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED = 'true';
    const bffPayload = {
      acceptedAt: '2026-05-14T00:00:00.000Z',
      correlationId,
      emittedEvents: ['logging.demo.server.manual'],
      eventName: 'logging.demo.server.manual',
      incomingTraceparent: traceparent,
      parentSpanId: '0123456789abcdef',
      route: '/logging-demo',
      serverSpanId: 'fedcba9876543210',
      serverTraceparent:
        '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01',
      traceFlags: '01',
      traceId: '0123456789abcdef0123456789abcdef',
    };
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(bffPayload), {
        status: 202,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await POST(createTelemetryRequest());
    const payload = await response.json();
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://bff.example.test/bff/observability/events'),
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(headers.get('x-csrf-token')).toBe('csrf-token-123');
    expect(headers.get('traceparent')).toBe(traceparent);
    expect(response.status).toBe(202);
    expect(payload).toEqual(bffPayload);
  });
});

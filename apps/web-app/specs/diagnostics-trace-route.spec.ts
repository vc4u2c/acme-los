/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/diagnostics/trace/route';

const correlationId = '931f0597-d984-42e3-a652-e64fe3b719ef';
const traceId = '0123456789abcdef0123456789abcdef';
const browserTraceparent = `00-${traceId}-0123456789abcdef-01`;
let requestAddressSuffix = 0;

function createDiagnosticsTraceRequest(): NextRequest {
  return new NextRequest('https://los.example.test/api/diagnostics/trace', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'acme-los.csrf-token=csrf-token-123',
      traceparent: browserTraceparent,
      'user-agent': 'jest',
      'x-correlation-id': correlationId,
      'x-csrf-token': 'csrf-token-123',
      'x-forwarded-for': `203.0.113.${++requestAddressSuffix}`,
    },
    body: JSON.stringify({
      route: '/logging-demo',
    }),
  });
}

describe('diagnostics trace route', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalProxyMode = process.env.ACME_BFF_PROXY_MODE;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
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

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('forwards a real diagnostic API call to the BFF with trace and correlation headers', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    const bffPayload = {
      acceptedAt: '2026-05-14T00:00:00.000Z',
      correlationId,
      emittedEvents: ['diagnostics.trace.bff.received'],
      eventName: 'diagnostics.trace.bff.received',
      handledBy: 'bff-api',
      incomingTraceparent:
        '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01',
      parentSpanId: 'fedcba9876543210',
      route: '/logging-demo',
      serverSpanId: '0011223344556677',
      serverTraceparent:
        '00-0123456789abcdef0123456789abcdef-0011223344556677-01',
      traceFlags: '01',
      traceId,
    };
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(bffPayload), {
        status: 202,
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': correlationId,
        },
      }),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await POST(createDiagnosticsTraceRequest());
    const payload = await response.json();
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;
    const forwardedTraceparent = headers.get('traceparent');

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://bff.example.test/bff/diagnostics/trace'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ route: '/logging-demo' }),
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(headers.get('x-correlation-id')).toBe(correlationId);
    expect(headers.get('x-csrf-token')).toBe('csrf-token-123');
    expect(forwardedTraceparent).toMatch(
      /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/,
    );
    expect(forwardedTraceparent).not.toBe(browserTraceparent);
    expect(response.status).toBe(202);
    expect(response.headers.get('x-correlation-id')).toBe(correlationId);
    expect(payload).toEqual(bffPayload);
  });

  it('returns unavailable when the BFF proxy is disabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'next';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await POST(createDiagnosticsTraceRequest());
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.headers.get('x-correlation-id')).toBe(correlationId);
    expect(payload).toEqual({
      message: 'BFF diagnostic tracing is not configured.',
    });
  });
});

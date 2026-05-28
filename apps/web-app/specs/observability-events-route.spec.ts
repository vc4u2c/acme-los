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

  it('keeps browser observability ingestion on the Next facade when BFF mode is enabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await POST(createTelemetryRequest());
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
    expect(payload.handledBy).toBe('next-facade');
    expect(payload.eventName).toBe('logging.demo.server.manual');
    expect(payload.route).toBe('/logging-demo');
  });
});

/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET as getHealth } from '../src/app/api/health/route';
import { GET as getLiveHealth } from '../src/app/api/health/live/route';

describe('health routes', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalUrl = process.env.ACME_BFF_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.ACME_BFF_BASE_URL;
    } else {
      process.env.ACME_BFF_BASE_URL = originalBaseUrl;
    }

    if (originalUrl === undefined) {
      delete process.env.ACME_BFF_URL;
    } else {
      process.env.ACME_BFF_URL = originalUrl;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps live health local for infrastructure probes', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await getLiveHealth();
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('web-app');
  });

  it('marks public health degraded when the BFF is not configured', async () => {
    delete process.env.ACME_BFF_BASE_URL;
    delete process.env.ACME_BFF_URL;
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await getHealth(
      new NextRequest('https://los.example.test/api/health'),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.status).toBe('degraded');
    expect(payload.service).toBe('web-app');
    expect(payload.bff.enabled).toBe(true);
    expect(payload.layers.web.service).toBe('web-app');
    expect(payload.layers.bff.service).toBe('bff-api');
    expect(payload.layers.bff.status).toBe('unhealthy');
    expect(payload.layers.bff.error).toContain('ACME_BFF_BASE_URL');
  });

  it('returns public health for both web and BFF layers when the BFF is configured', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'bff-api',
          version: 'bff-version-123',
          environment: 'dev',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await getHealth(
      new NextRequest('https://los.example.test/api/health'),
    );
    const payload = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://bff.example.test/bff/health'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('web-app');
    expect(payload.bff.enabled).toBe(true);
    expect(payload.layers.web.service).toBe('web-app');
    expect(payload.layers.bff.service).toBe('bff-api');
    expect(payload.layers.bff.status).toBe('ok');
    expect(payload.layers.bff.version).toBe('bff-version-123');
    expect(payload.layers.bff.upstreamStatus).toBe(200);
  });

  it('marks public health degraded when the BFF layer is unavailable', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('BFF timed out'));

    global.fetch = fetchSpy as typeof fetch;

    const response = await getHealth(
      new NextRequest('https://los.example.test/api/health'),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe('degraded');
    expect(payload.bff.enabled).toBe(true);
    expect(payload.layers.web.service).toBe('web-app');
    expect(payload.layers.bff.service).toBe('bff-api');
    expect(payload.layers.bff.status).toBe('unhealthy');
    expect(payload.layers.bff.error).toContain('BFF timed out');
  });
});

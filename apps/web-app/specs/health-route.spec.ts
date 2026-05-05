/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET as getHealth } from '../src/app/api/health/route';
import { GET as getLiveHealth } from '../src/app/api/health/live/route';

describe('health routes', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.ACME_BFF_BASE_URL;
    } else {
      process.env.ACME_BFF_BASE_URL = originalBaseUrl;
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

  it('keeps public health on the BFF path when the BFF is configured', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'bff-api' }), {
        headers: {
          'content-type': 'application/json',
        },
      }),
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
      }),
    );
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('bff-api');
  });
});

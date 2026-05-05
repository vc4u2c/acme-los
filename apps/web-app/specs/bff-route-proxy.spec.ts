/** @jest-environment node */

import { NextRequest } from 'next/server';
import { createWebApiClient } from '@acme-los/api/web-client';
import { maybeProxyToBff } from '../src/app/api/_lib/bff-route-proxy';

describe('BFF route proxy', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalUrl = process.env.ACME_BFF_URL;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
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

    if (originalTrustedProxySecret === undefined) {
      delete process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
    } else {
      process.env.ACME_BFF_TRUSTED_PROXY_SECRET = originalTrustedProxySecret;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null when the BFF base URL is not configured', async () => {
    delete process.env.ACME_BFF_BASE_URL;
    delete process.env.ACME_BFF_URL;
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const request = new NextRequest('https://los.example.test/api/health');
    const response = await maybeProxyToBff(request, '/bff/health');

    expect(response).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the request to the configured BFF and preserves response details', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'acme-los.csrf-token=abc123; Path=/; HttpOnly',
        },
      }),
    );

    global.fetch = fetchSpy as typeof fetch;

    const request = new NextRequest(
      'https://los.example.test/api/auth/session?includeDebug=1',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'acme-los.csrf-token=abc123',
          'x-csrf-token': 'abc123',
          traceparent:
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
          'x-correlation-id': 'corr-123',
        },
        body: JSON.stringify({ idToken: 'header.payload.signature' }),
      },
    );

    const response = await maybeProxyToBff(request, '/bff/auth/session');

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://bff.example.test/bff/auth/session?includeDebug=1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'header.payload.signature' }),
        cache: 'no-store',
        redirect: 'manual',
      }),
    );

    expect(response).not.toBeNull();
    if (response === null) {
      throw new Error('Expected the BFF proxy to return a response.');
    }

    expect(response.status).toBe(202);
    expect(response.headers.get('set-cookie')).toContain('acme-los.csrf-token');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('appends trusted extra headers when the facade supplies them', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    global.fetch = fetchSpy as typeof fetch;

    const request = new NextRequest(
      'https://los.example.test/api/customer/profile',
      {
        headers: {
          cookie: 'acme-los.csrf-token=abc123',
        },
      },
    );

    await maybeProxyToBff(request, '/bff/customer/profile', {
      extraHeaders: {
        'x-acme-authenticated-user-id': 'user-123',
        'x-acme-authenticated-user-email': 'user@example.com',
        'x-acme-authenticated-customer-id': 'customer-123',
        'x-acme-authenticated-lead-id': 'lead-123',
      },
    });

    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;

    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(headers.get('x-acme-authenticated-user-id')).toBe('user-123');
    expect(headers.get('x-acme-authenticated-user-email')).toBe(
      'user@example.com',
    );
    expect(headers.get('x-acme-authenticated-customer-id')).toBe(
      'customer-123',
    );
    expect(headers.get('x-acme-authenticated-lead-id')).toBe('lead-123');
  });

  it('keeps the browser web API client pointed at the Next facade', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn<typeof fetch>().mockImplementation((input) => {
      if (input === '/api/security/csrf') {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: 'csrf-123' })),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            profile: {
              email: 'user@example.com',
              phone: '312-555-0100',
              streetAddress: '123 Main Street',
              addressLine2: '',
              city: 'Chicago',
              state: 'IL',
              zipCode: '60601',
            },
          }),
        ),
      );
    });
    const client = createWebApiClient({ fetchImpl: fetchSpy as typeof fetch });

    await client.customer.updateProfile({
      profile: {
        email: 'user@example.com',
        phone: '312-555-0100',
        streetAddress: '123 Main Street',
        addressLine2: '',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601',
      },
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/security/csrf',
      expect.any(Object),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/customer/profile',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/bff/'),
      expect.any(Object),
    );
  });
});

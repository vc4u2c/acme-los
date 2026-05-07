/** @jest-environment node */

import { NextRequest } from 'next/server';
import { assertValidCsrf } from '@acme-los/api/web-server';
import { GET as getCsrfToken } from '../src/app/api/security/csrf/route';

describe('CSRF route', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalUrl = process.env.ACME_BFF_URL;
  const originalProxyMode = process.env.ACME_BFF_PROXY_MODE;
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

    if (originalProxyMode === undefined) {
      delete process.env.ACME_BFF_PROXY_MODE;
    } else {
      process.env.ACME_BFF_PROXY_MODE = originalProxyMode;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('issues the browser-facing CSRF cookie locally when BFF mode is disabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'next';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await getCsrfToken(
      new NextRequest('https://los.example.test/api/security/csrf'),
    );
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.csrfToken).toEqual(expect.any(String));
    expect(response.headers.get('set-cookie')).toContain(
      'acme-los.csrf-token=',
    );
  });

  it('delegates browser-facing CSRF issuance to the BFF when BFF mode is enabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: 'bff-csrf-token-123' }), {
        headers: {
          'content-type': 'application/json',
          'set-cookie':
            'acme-los.csrf-token=bff-csrf-token-123; Path=/; HttpOnly; SameSite=Lax; Secure',
        },
      }),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await getCsrfToken(
      new NextRequest('https://los.example.test/api/security/csrf'),
    );
    const payload = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://bff.example.test/bff/security/csrf'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    expect(payload.csrfToken).toBe('bff-csrf-token-123');
    expect(response.headers.get('set-cookie')).toContain(
      'acme-los.csrf-token=bff-csrf-token-123',
    );
  });

  it('accepts a BFF-issued raw CSRF cookie on facade mutations', () => {
    const request = new NextRequest(
      'https://los.example.test/api/customer/profile',
      {
        method: 'PUT',
        headers: {
          cookie: 'acme-los.csrf-token=bff-csrf-token-123',
          'x-csrf-token': 'bff-csrf-token-123',
        },
      },
    );

    expect(() => assertValidCsrf(request)).not.toThrow();
  });
});

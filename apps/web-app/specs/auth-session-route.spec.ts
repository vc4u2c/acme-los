/** @jest-environment node */

import { NextRequest } from 'next/server';
import { resetBffServiceAuthCacheForTests } from '@acme-los/api/web-server';
import { GET } from '../src/app/api/auth/session/route';

const mockGetToken = jest.fn();

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(() => ({
    getToken: mockGetToken,
  })),
}));

describe('auth session route', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalProxyMode = process.env.ACME_BFF_PROXY_MODE;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalServiceAuthMode = process.env.ACME_BFF_SERVICE_AUTH_MODE;
  const originalServiceAuthScope = process.env.ACME_BFF_SERVICE_AUTH_SCOPE;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetToken.mockResolvedValue({
      token: 'managed-identity-token-123',
      expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
    });
  });

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

    if (originalServiceAuthMode === undefined) {
      delete process.env.ACME_BFF_SERVICE_AUTH_MODE;
    } else {
      process.env.ACME_BFF_SERVICE_AUTH_MODE = originalServiceAuthMode;
    }

    if (originalServiceAuthScope === undefined) {
      delete process.env.ACME_BFF_SERVICE_AUTH_SCOPE;
    } else {
      process.env.ACME_BFF_SERVICE_AUTH_SCOPE = originalServiceAuthScope;
    }

    global.fetch = originalFetch;
    resetBffServiceAuthCacheForTests();
    mockGetToken.mockReset();
    jest.restoreAllMocks();
  });

  it('keeps session reads local while the BFF mode is disabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'next';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy as typeof fetch;

    const response = await GET(
      new NextRequest('https://los.example.test/api/auth/session'),
    );
    const payload = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.session.isAuthenticated).toBe(false);
    expect(payload.session.status).toBe('unauthenticated');
  });

  it('delegates session reads to the BFF when BFF mode is enabled', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            provider: 'okta',
            status: 'unauthenticated',
            isAuthenticated: false,
            assuranceLevel: 'anonymous',
            user: null,
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await GET(
      new NextRequest('https://los.example.test/api/auth/session'),
    );
    const payload = await response.json();
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('http://bff.example.test/bff/auth/session'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(payload.session.status).toBe('unauthenticated');
  });

  it('adds service identity auth when delegated session reads call the BFF', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_PROXY_MODE = 'bff';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    process.env.ACME_BFF_SERVICE_AUTH_MODE = 'entra';
    process.env.ACME_BFF_SERVICE_AUTH_SCOPE = 'api://acme-los-bff/.default';
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            provider: 'okta',
            status: 'unauthenticated',
            isAuthenticated: false,
            assuranceLevel: 'anonymous',
            user: null,
          },
        }),
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    await GET(new NextRequest('https://los.example.test/api/auth/session'));

    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;

    expect(headers.get('authorization')).toBe(
      'Bearer managed-identity-token-123',
    );
    expect(mockGetToken).toHaveBeenCalledWith('api://acme-los-bff/.default');
  });
});

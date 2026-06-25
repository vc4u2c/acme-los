/** @jest-environment node */

import { NextRequest } from 'next/server';
import { readSecurityInspectorServerSnapshot } from '@acme-los/api/web-server';

describe('security inspector snapshot', () => {
  const originalAuthProvider = process.env.ACME_AUTH_PROVIDER;
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalAuthProvider === undefined) {
      delete process.env.ACME_AUTH_PROVIDER;
    } else {
      process.env.ACME_AUTH_PROVIDER = originalAuthProvider;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.ACME_BFF_BASE_URL;
    } else {
      process.env.ACME_BFF_BASE_URL = originalBaseUrl;
    }

    if (originalTrustedProxySecret === undefined) {
      delete process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
    } else {
      process.env.ACME_BFF_TRUSTED_PROXY_SECRET = originalTrustedProxySecret;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads the BFF-owned token snapshot when the BFF owns auth state', async () => {
    process.env.ACME_AUTH_PROVIDER = 'okta';
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';

    const bffSnapshot = {
      provider: 'okta',
      stateStoreMode: 'redis',
      generatedAt: '2026-05-07T17:00:00.000Z',
      requestCookies: [],
      decodedCookies: {
        authSession: { sessionId: 'session-123' },
        authTransaction: null,
      },
      storedSession: {
        sessionId: 'session-123',
        createdAt: 1_779_000_000_000,
        expiresAt: 1_779_003_600,
        lastActivityAt: 1_779_000_100,
        idleExpiresAt: 1_779_000_220,
        session: {
          provider: 'okta',
          status: 'authenticated',
          isAuthenticated: true,
          assuranceLevel: 'aal1',
          user: {
            id: 'user-123',
            displayName: 'User Test',
          },
        },
        tokens: {
          idToken: {
            raw: 'id-token-123',
            claims: { sub: 'user-123' },
          },
          accessToken: {
            raw: 'access-token-123',
            claims: { sub: 'user-123' },
          },
          refreshToken: 'refresh-token-123',
          tokenType: 'Bearer',
        },
      },
    };
    const fetchSpy = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(bffSnapshot), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    global.fetch = fetchSpy;

    const snapshot = await readSecurityInspectorServerSnapshot(
      new NextRequest('https://los.example.test/api/security/inspector', {
        headers: {
          cookie: 'acme-los.auth-session=signed-session',
          'x-correlation-id': 'correlation-123',
        },
      }),
    );

    expect(snapshot.storedSession?.tokens.idToken.raw).toBe('id-token-123');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [input, init] = fetchSpy.mock.calls[0] as [URL, { headers: Headers }];

    expect(input.toString()).toBe(
      'https://bff.example.test/bff/security/inspector',
    );
    expect(init.headers.get('cookie')).toBe(
      'acme-los.auth-session=signed-session',
    );
    expect(init.headers.get('x-correlation-id')).toBe('correlation-123');
    expect(init.headers.get('x-forwarded-host')).toBe('los.example.test');
    expect(init.headers.get('x-forwarded-proto')).toBe('https');
    expect(init.headers.get('x-acme-bff-proxy-secret')).toBe(
      'proxy-secret-123',
    );
  });

  it('reads a token-free local snapshot only for explicit mock auth', async () => {
    process.env.ACME_AUTH_PROVIDER = 'mock';
    process.env.ACME_BFF_BASE_URL = 'https://bff.example.test';
    const fetchSpy = jest.fn();

    global.fetch = fetchSpy;

    const snapshot = await readSecurityInspectorServerSnapshot(
      new NextRequest('https://los.example.test/api/security/inspector'),
    );

    expect(snapshot.provider).toBe('mock');
    expect(snapshot.storedSession).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

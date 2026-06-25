/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET as completeAuthCallback } from '../src/app/api/auth/callback/route';
import { GET as startAuthFlow } from '../src/app/api/auth/start/route';

const DEV_SESSION_SECRET = 'acme-los-local-dev-session-secret';

function toBase64Url(value: Buffer | string): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;

  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSignedCookie(payload: Record<string, unknown>): string {
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = toBase64Url(
    createHmac('sha256', DEV_SESSION_SECRET).update(payloadPart).digest(),
  );

  return `${payloadPart}.${signaturePart}`;
}

describe('BFF-backed auth flow routes', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalWebSessionSecret = process.env.ACME_WEB_SESSION_SECRET;
  const originalFetch = global.fetch;

  afterEach(() => {
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

    if (originalWebSessionSecret === undefined) {
      delete process.env.ACME_WEB_SESSION_SECRET;
    } else {
      process.env.ACME_WEB_SESSION_SECRET = originalWebSessionSecret;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('delegates sign-in start to the BFF and stores the BFF transaction cookie', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          authorizeUrl:
            'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=okta-state-123',
          transactionId: 'bff-transaction-123',
          maxAge: 600,
          returnTo: '/apply/personal-info',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await startAuthFlow(
      new NextRequest(
        'https://los.example.test/api/auth/start?returnTo=/apply/personal-info&aal=aal1&widgetFlow=resetPassword',
        {
          headers: {
            cookie: 'acme-los.csrf-token=csrf-123',
            traceparent:
              '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
          },
        },
      ),
    );
    const targetUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;
    const setCookie = response.headers.get('set-cookie');

    expect(response.headers.get('location')).toBe(
      'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=okta-state-123',
    );
    expect(targetUrl.origin).toBe('http://bff.example.test');
    expect(targetUrl.pathname).toBe('/bff/auth/login');
    expect(targetUrl.searchParams.get('returnTo')).toBe('/apply/personal-info');
    expect(targetUrl.searchParams.get('aal')).toBe('aal1');
    expect(targetUrl.searchParams.get('widgetFlow')).toBe('resetPassword');
    expect(headers.get('cookie')).toBe('acme-los.csrf-token=csrf-123');
    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(setCookie).toContain('acme-los.auth-transaction=');
  });

  it('starts funding step-up through the BFF with single-use route-entry consumption', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const targetUrl = input as URL;

        if (targetUrl.pathname === '/bff/auth/session') {
          return new Response(
            JSON.stringify({
              session: {
                provider: 'okta',
                status: 'authenticated',
                isAuthenticated: true,
                assuranceLevel: 'aal1',
                user: {
                  id: 'user-123',
                  displayName: 'Funding User',
                  email: 'funding@example.com',
                },
              },
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (targetUrl.pathname === '/bff/auth/login') {
          return new Response(
            JSON.stringify({
              authorizeUrl:
                'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=funding-state-123',
              transactionId: 'bff-funding-transaction-123',
              maxAge: 600,
              returnTo: '/apply/funding',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        throw new Error(`Unexpected BFF request: ${targetUrl.toString()}`);
      });

    global.fetch = fetchSpy as typeof fetch;

    const response = await startAuthFlow(
      new NextRequest(
        'https://los.example.test/api/auth/start?returnTo=/apply/funding&aal=aal1',
        {
          headers: {
            cookie:
              'acme-los.auth-session=session-cookie; acme-los.csrf-token=csrf-123',
          },
        },
      ),
    );
    const loginCall = fetchSpy.mock.calls.find(
      ([target]) => (target as URL).pathname === '/bff/auth/login',
    );
    const targetUrl = loginCall?.[0] as URL;

    expect(response.headers.get('location')).toBe(
      'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=funding-state-123',
    );
    expect(targetUrl.pathname).toBe('/bff/auth/login');
    expect(targetUrl.searchParams.get('returnTo')).toBe('/apply/funding');
    expect(targetUrl.searchParams.get('aal')).toBe('aal2');
    expect(targetUrl.searchParams.get('expectedUserId')).toBe('user-123');
    expect(targetUrl.searchParams.get('stepUpReason')).toBe('funding');
    expect(targetUrl.searchParams.get('stepUpMaxAgeSeconds')).toBe('600');
    expect(targetUrl.searchParams.get('stepUpConsumeOnSatisfied')).toBe('true');
  });

  it('starts account email step-up through the BFF with a phone/SMS-specific marker', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const targetUrl = input as URL;

        if (targetUrl.pathname === '/bff/auth/session') {
          return new Response(
            JSON.stringify({
              session: {
                provider: 'okta',
                status: 'authenticated',
                isAuthenticated: true,
                assuranceLevel: 'aal1',
                user: {
                  id: 'user-123',
                  displayName: 'Account User',
                  email: 'account@example.com',
                },
              },
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (targetUrl.pathname === '/bff/auth/login') {
          return new Response(
            JSON.stringify({
              authorizeUrl:
                'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=account-state-123',
              transactionId: 'bff-account-transaction-123',
              maxAge: 600,
              returnTo: '/account/security/email',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        throw new Error(`Unexpected BFF request: ${targetUrl.toString()}`);
      });

    global.fetch = fetchSpy as typeof fetch;

    const response = await startAuthFlow(
      new NextRequest(
        'https://los.example.test/api/auth/start?returnTo=/account/security/email&aal=aal1',
        {
          headers: {
            cookie:
              'acme-los.auth-session=session-cookie; acme-los.csrf-token=csrf-123',
          },
        },
      ),
    );
    const loginCall = fetchSpy.mock.calls.find(
      ([target]) => (target as URL).pathname === '/bff/auth/login',
    );
    const targetUrl = loginCall?.[0] as URL;

    expect(response.headers.get('location')).toBe(
      'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=account-state-123',
    );
    expect(targetUrl.searchParams.get('returnTo')).toBe(
      '/account/security/email',
    );
    expect(targetUrl.searchParams.get('aal')).toBe('aal2');
    expect(targetUrl.searchParams.get('expectedUserId')).toBe('user-123');
    expect(targetUrl.searchParams.get('stepUpReason')).toBe('account-email');
    expect(targetUrl.searchParams.get('stepUpMaxAgeSeconds')).toBe('600');
    expect(targetUrl.searchParams.get('stepUpConsumeOnSatisfied')).toBe(
      'false',
    );
  });

  it('starts account password step-up through the BFF with a phone/SMS-specific marker', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const targetUrl = input as URL;

        if (targetUrl.pathname === '/bff/auth/session') {
          return new Response(
            JSON.stringify({
              session: {
                provider: 'okta',
                status: 'authenticated',
                isAuthenticated: true,
                assuranceLevel: 'aal1',
                user: {
                  id: 'user-123',
                  displayName: 'Account User',
                  email: 'account@example.com',
                },
              },
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (targetUrl.pathname === '/bff/auth/login') {
          return new Response(
            JSON.stringify({
              authorizeUrl:
                'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=account-password-state-123',
              transactionId: 'bff-account-password-transaction-123',
              maxAge: 600,
              returnTo: '/account/security/password',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        throw new Error(`Unexpected BFF request: ${targetUrl.toString()}`);
      });

    global.fetch = fetchSpy as typeof fetch;

    const response = await startAuthFlow(
      new NextRequest(
        'https://los.example.test/api/auth/start?returnTo=/account/security/password&aal=aal1',
        {
          headers: {
            cookie:
              'acme-los.auth-session=session-cookie; acme-los.csrf-token=csrf-123',
          },
        },
      ),
    );
    const loginCall = fetchSpy.mock.calls.find(
      ([target]) => (target as URL).pathname === '/bff/auth/login',
    );
    const targetUrl = loginCall?.[0] as URL;

    expect(response.headers.get('location')).toBe(
      'https://dev-123456.okta.com/oauth2/default/v1/authorize?state=account-password-state-123',
    );
    expect(targetUrl.searchParams.get('returnTo')).toBe(
      '/account/security/password',
    );
    expect(targetUrl.searchParams.get('aal')).toBe('aal2');
    expect(targetUrl.searchParams.get('expectedUserId')).toBe('user-123');
    expect(targetUrl.searchParams.get('stepUpReason')).toBe('account-password');
    expect(targetUrl.searchParams.get('stepUpMaxAgeSeconds')).toBe('600');
    expect(targetUrl.searchParams.get('stepUpConsumeOnSatisfied')).toBe(
      'false',
    );
  });

  it('delegates callback exchange to the BFF before checking Next-owned state', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const authTransaction = createSignedCookie({
      transactionId: 'bff-transaction-123',
      returnTo: '/apply/personal-info',
      minimumAssuranceLevel: 'aal1',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            provider: 'okta',
            status: 'authenticated',
            isAuthenticated: true,
            assuranceLevel: 'aal1',
            user: {
              id: 'user-123',
              displayName: 'User Test',
              email: 'user@example.com',
            },
          },
          returnTo: '/apply/funding',
          sessionTiming: {
            absoluteExpiresAt: 4102444800,
            idleExpiresAt: 4102441200,
            idleTimeoutSeconds: 900,
            warningSeconds: 120,
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-acme-auth-session-id': 'stored-session-123',
            'x-acme-auth-session-max-age': '900',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await completeAuthCallback(
      new NextRequest(
        'https://los.example.test/api/auth/callback?code=code-123&state=okta-state-123',
        {
          headers: {
            cookie: `acme-los.auth-transaction=${authTransaction}`,
          },
        },
      ),
    );
    const targetUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const headers = requestInit?.headers as Headers;
    const setCookie = response.headers.get('set-cookie');

    expect(response.headers.get('location')).toBe(
      'https://los.example.test/apply/funding',
    );
    expect(targetUrl.toString()).toBe(
      'http://bff.example.test/bff/auth/callback?code=code-123&state=okta-state-123',
    );
    expect(headers.get('cookie')).toContain('acme-los.auth-transaction=');
    expect(headers.get('x-acme-bff-proxy-secret')).toBe('proxy-secret-123');
    expect(setCookie).toContain('acme-los.auth-session=');
    expect(setCookie).toContain('acme-los.auth-transaction=;');
  });

  it('redirects completed account-security step-up callbacks back to the action UI', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const authTransaction = createSignedCookie({
      transactionId: 'bff-account-password-transaction-123',
      returnTo: '/account/security/password',
      minimumAssuranceLevel: 'aal2',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            provider: 'okta',
            status: 'authenticated',
            isAuthenticated: true,
            assuranceLevel: 'aal2',
            user: {
              id: 'user-123',
              displayName: 'Account User',
              email: 'account@example.com',
              authenticationMethods: ['pwd', 'sms'],
            },
          },
          returnTo: '/account/security/password',
          sessionTiming: {
            absoluteExpiresAt: 4102444800,
            idleExpiresAt: 4102441200,
            idleTimeoutSeconds: 900,
            warningSeconds: 120,
            stepUp: {
              reason: 'account-password',
              completedAt: 1770000000,
              expiresAt: 1770000600,
            },
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-acme-auth-session-id': 'stored-account-session-123',
            'x-acme-auth-session-max-age': '900',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await completeAuthCallback(
      new NextRequest(
        'https://los.example.test/api/auth/callback?code=code-123&state=okta-state-123',
        {
          headers: {
            cookie: `acme-los.auth-transaction=${authTransaction}`,
          },
        },
      ),
    );

    expect(response.headers.get('location')).toBe(
      'https://los.example.test/account/security/password',
    );
    expect(response.headers.get('set-cookie')).toContain(
      'acme-los.auth-session=',
    );
  });

  it('restarts recoverable expired callbacks instead of leaving a dead timeout page', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            'Your secure sign-in session expired. Please start the hosted sign-in flow again.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    global.fetch = fetchSpy as typeof fetch;

    const response = await completeAuthCallback(
      new NextRequest(
        'https://los.example.test/api/auth/callback?code=code-123&state=okta-state-123',
      ),
    );
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.pathname).toBe('/account/sign-in');
    expect(location.searchParams.get('returnTo')).toBe('/apply/personal-info');
    expect(location.searchParams.get('authRecovery')).toBe('restart');
    expect(location.searchParams.get('authError')).toContain(
      'secure sign-in session expired',
    );
  });
});

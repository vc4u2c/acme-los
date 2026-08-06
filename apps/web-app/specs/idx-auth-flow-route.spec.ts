/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST as completeIdxAuth } from '../src/app/api/auth/idx/complete/route';
import { POST as startIdxAuth } from '../src/app/api/auth/idx/start/route';

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

describe('app-owned IDX auth routes', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalWebSessionSecret = process.env.ACME_WEB_SESSION_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
    delete process.env.ACME_WEB_SESSION_SECRET;
  });

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

  it('derives funding step-up on the server and returns only public IDX metadata', async () => {
    const fetchSpy = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const targetUrl = new URL(String(input));

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
                  displayName: 'Test Customer',
                },
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }

        expect(targetUrl.pathname).toBe('/bff/auth/idx/start');
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            issuer: 'https://dev-123456.okta.com/oauth2/default',
            clientId: 'client-123',
            redirectUri: 'https://los.example.test/account/sign-in',
            scopes: ['openid', 'profile'],
            state: 'state-123',
            nonce: 'nonce-123',
            codeChallenge: 'challenge-123',
            codeChallengeMethod: 'S256',
            acrValues: 'urn:okta:loa:2fa:any',
            maxAgeSeconds: null,
            transactionId: 'transaction-123',
            maxAge: 1800,
            returnTo: '/apply/funding',
            stepUpReason: 'funding',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      });
    global.fetch = fetchSpy as typeof fetch;

    const response = await startIdxAuth(
      new NextRequest('https://los.example.test/api/auth/idx/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'acme-los.csrf-token=csrf-123',
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({
          returnTo: '/apply/funding',
          minimumAssuranceLevel: 'aal1',
          stepUp: { reason: 'account-phone', maxAgeSeconds: 99999 },
        }),
      }),
    );
    const payload = await response.json();
    const startRequest = fetchSpy.mock.calls.find(
      ([target]) => new URL(String(target)).pathname === '/bff/auth/idx/start',
    );
    const bffPayload = JSON.parse(String(startRequest?.[1]?.body));

    expect(response.status).toBe(200);
    expect(payload).not.toHaveProperty('codeVerifier');
    expect(payload).not.toHaveProperty('accessToken');
    expect(bffPayload.minimumAssuranceLevel).toBe('aal2');
    expect(bffPayload.expectedUserId).toBe('user-123');
    expect(bffPayload.stepUp).toEqual({
      reason: 'funding',
      maxAgeSeconds: 600,
      consumeOnSatisfied: true,
    });
    expect(response.headers.get('set-cookie')).toContain(
      'acme-los.auth-transaction=',
    );
  });

  it('sends the one-time interaction code to the BFF and writes an opaque session cookie', async () => {
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
              displayName: 'Test Customer',
              authenticationMethods: ['pwd', 'sms'],
            },
          },
          returnTo: '/apply/funding',
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-acme-auth-session-id': 'opaque-session-123',
            'x-acme-auth-session-max-age': '3600',
          },
        },
      ),
    );
    global.fetch = fetchSpy as typeof fetch;
    const transactionCookie = createSignedCookie({
      transactionId: 'transaction-123',
      returnTo: '/apply/funding',
      minimumAssuranceLevel: 'aal2',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const postChangeCookie = createSignedCookie({
      action: 'password',
      expectedUserId: 'user-123',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const response = await completeIdxAuth(
      new NextRequest('https://los.example.test/api/auth/idx/complete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `acme-los.csrf-token=csrf-123; acme-los.auth-transaction=${transactionCookie}; acme-los.post-change-auth=${postChangeCookie}`,
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({
          interactionCode: 'interaction-code-123',
          state: 'state-123',
        }),
      }),
    );
    const targetUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    const bffPayload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    const setCookie = response.headers.get('set-cookie');

    expect(response.status).toBe(200);
    expect(targetUrl.pathname).toBe('/bff/auth/idx/complete');
    expect(bffPayload).toEqual({
      interactionCode: 'interaction-code-123',
      state: 'state-123',
    });
    expect(setCookie).toContain('acme-los.auth-session=');
    expect(setCookie).toContain('acme-los.post-change-auth=;');
    expect(setCookie).not.toContain('interaction-code-123');
  });

  it('binds post-change sign-in to the expected subject and exact new factor', async () => {
    const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          issuer: 'https://dev-123456.okta.com/oauth2/default',
          clientId: 'client-123',
          redirectUri: 'https://los.example.test/account/sign-in',
          scopes: ['openid', 'profile'],
          state: 'state-123',
          nonce: 'nonce-123',
          codeChallenge: 'challenge-123',
          codeChallengeMethod: 'S256',
          acrValues: 'urn:okta:loa:2fa:any',
          maxAgeSeconds: 0,
          transactionId: 'transaction-123',
          maxAge: 1800,
          returnTo: '/account/profile',
          stepUpReason: 'post-email-change',
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchSpy as typeof fetch;
    const postChangeCookie = createSignedCookie({
      action: 'email',
      expectedUserId: 'user-123',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const response = await startIdxAuth(
      new NextRequest('https://los.example.test/api/auth/idx/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `acme-los.csrf-token=csrf-123; acme-los.post-change-auth=${postChangeCookie}`,
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({
          returnTo: '/apply/funding',
          minimumAssuranceLevel: 'aal1',
          leadId: 'browser-controlled-lead',
        }),
      }),
    );
    const bffPayload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    const setCookie = response.headers.get('set-cookie');

    expect(response.status).toBe(200);
    expect(bffPayload).toEqual({
      returnTo: '/account/profile',
      minimumAssuranceLevel: 'aal2',
      expectedUserId: 'user-123',
      stepUp: {
        reason: 'post-email-change',
        maxAgeSeconds: 600,
        consumeOnSatisfied: true,
      },
    });
    expect(setCookie).toContain('acme-los.auth-transaction=');
    expect(setCookie).not.toContain('acme-los.post-change-auth=;');
  });
});

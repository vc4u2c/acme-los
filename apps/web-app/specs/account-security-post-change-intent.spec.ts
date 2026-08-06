/** @jest-environment node */

import { NextRequest } from 'next/server';
import { readPostChangeAuthIntent } from '@acme-los/api/web-server';
import { POST as verifyEmailChange } from '../src/app/api/account/security/email/verify/route';
import { POST as changePassword } from '../src/app/api/account/security/password/route';
import { POST as verifyPhoneChange } from '../src/app/api/account/security/phone/verify/route';

describe('account security post-change intent issuance', () => {
  const originalBaseUrl = process.env.ACME_BFF_BASE_URL;
  const originalTrustedProxySecret = process.env.ACME_BFF_TRUSTED_PROXY_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
    process.env.ACME_BFF_TRUSTED_PROXY_SECRET = 'proxy-secret-123';
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

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    {
      action: 'email' as const,
      handler: verifyEmailChange,
      route: '/api/account/security/email/verify',
      upstream: '/bff/account/security/email/verify',
      body: {
        emailId: 'email-123',
        challengeId: 'challenge-123',
        verificationCode: '123456',
      },
      response: { status: 'verified', email: 'new@example.com' },
    },
    {
      action: 'phone' as const,
      handler: verifyPhoneChange,
      route: '/api/account/security/phone/verify',
      upstream: '/bff/account/security/phone/verify',
      body: { phoneId: 'phone-123', verificationCode: '123456' },
      response: { status: 'verified' },
    },
    {
      action: 'password' as const,
      handler: changePassword,
      route: '/api/account/security/password',
      upstream: '/bff/account/security/password',
      body: {
        currentPassword: 'old-password-123',
        newPassword: 'new-password-456',
      },
      response: { status: 'changed' },
    },
  ])(
    'issues a signed $action intent only after a successful mutation',
    async ({
      action,
      handler,
      route,
      upstream,
      body,
      response: bffResponse,
    }) => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockImplementation(async (input) => {
          const pathname = new URL(String(input)).pathname;

          if (pathname === '/bff/auth/session/requirement') {
            return new Response(
              JSON.stringify({
                session: {
                  provider: 'okta',
                  status: 'authenticated',
                  isAuthenticated: true,
                  assuranceLevel: 'aal2',
                  user: {
                    id: 'user-123',
                    displayName: 'Test Customer',
                  },
                },
                satisfied: true,
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          }

          expect(pathname).toBe(upstream);
          return new Response(JSON.stringify(bffResponse), {
            headers: { 'content-type': 'application/json' },
          });
        }) as typeof fetch;

      const request = new NextRequest(`https://los.example.test${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'acme-los.csrf-token=csrf-123',
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify(body),
      });
      const result = await handler(request);
      const setCookie = result.headers.get('set-cookie') ?? '';
      const cookiePair = setCookie.split(';')[0] ?? '';
      const intentRequest = new NextRequest(
        'https://los.example.test/api/auth/idx/start',
        { headers: { cookie: cookiePair } },
      );

      expect(result.status).toBe(200);
      expect(readPostChangeAuthIntent(intentRequest)).toMatchObject({
        action,
        expectedUserId: 'user-123',
      });
    },
  );
});

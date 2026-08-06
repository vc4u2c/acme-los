/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import {
  POST_CHANGE_AUTH_COOKIE_NAME,
  readPostChangeAuthIntent,
  writePostChangeAuthIntent,
} from '@acme-los/api/web-server';

describe('post-change authentication intent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function getIntentCookieValue(response: NextResponse): string {
    const setCookie = response.headers.get('set-cookie') ?? '';
    const [cookiePair = ''] = setCookie.split(';');
    const [cookieName, ...cookieValueParts] = cookiePair.split('=');
    const cookieValue = cookieValueParts.join('=');

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Secure');
    expect(cookieName).toBe(POST_CHANGE_AUTH_COOKIE_NAME);
    expect(cookieValue).toBeTruthy();

    return cookieValue;
  }

  it('round-trips a signed HttpOnly subject-bound intent', () => {
    const request = new NextRequest('https://los.example.test/account/profile');
    const response = NextResponse.json({ ok: true });

    writePostChangeAuthIntent(request, response, {
      action: 'email',
      expectedUserId: 'user-123',
    });

    const cookieValue = getIntentCookieValue(response);
    expect(cookieValue).not.toContain('user-123');

    const nextRequest = new NextRequest(
      'https://los.example.test/api/auth/idx/start',
      {
        headers: {
          cookie: `${POST_CHANGE_AUTH_COOKIE_NAME}=${cookieValue}`,
        },
      },
    );

    expect(readPostChangeAuthIntent(nextRequest)).toMatchObject({
      action: 'email',
      expectedUserId: 'user-123',
    });
  });

  it('rejects an expired intent', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const request = new NextRequest('https://los.example.test/account/profile');
    const response = NextResponse.json({ ok: true });

    writePostChangeAuthIntent(request, response, {
      action: 'phone',
      expectedUserId: 'user-123',
    });
    const cookieValue = getIntentCookieValue(response);
    jest.mocked(Date.now).mockReturnValue(now + 11 * 60 * 1000);

    const nextRequest = new NextRequest(
      'https://los.example.test/api/auth/idx/start',
      {
        headers: {
          cookie: `${POST_CHANGE_AUTH_COOKIE_NAME}=${cookieValue}`,
        },
      },
    );

    expect(readPostChangeAuthIntent(nextRequest)).toBeNull();
  });

  it('rejects a tampered intent', () => {
    const request = new NextRequest('https://los.example.test/account/profile');
    const response = NextResponse.json({ ok: true });

    writePostChangeAuthIntent(request, response, {
      action: 'password',
      expectedUserId: 'user-123',
    });
    const cookieValue = getIntentCookieValue(response);
    const tamperedValue = `${cookieValue.slice(0, -1)}x`;
    const nextRequest = new NextRequest(
      'https://los.example.test/api/auth/idx/start',
      {
        headers: {
          cookie: `${POST_CHANGE_AUTH_COOKIE_NAME}=${tamperedValue}`,
        },
      },
    );

    expect(readPostChangeAuthIntent(nextRequest)).toBeNull();
  });
});

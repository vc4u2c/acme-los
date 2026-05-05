/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/auth/session/route';

describe('auth session route', () => {
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

  it('keeps session reads local while Next owns browser auth', async () => {
    process.env.ACME_BFF_BASE_URL = 'http://bff.example.test';
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
});

import {
  clearReplacedWebAuthSession,
  consumeStoredWebAuthStepUp,
  createStoredWebAuthSession,
  getAssuranceLevelFromAuthenticationEvidence,
  getStoredWebAuthSessionTiming,
  getStoredWebAuthSessionCookieMaxAge,
  isFundingStepUpMethodSatisfied,
  isStoredWebAuthStepUpFresh,
  deleteStoredWebAuthTransaction,
  readWebAuthTransaction,
  readWebAuthTransactionCookie,
  readLogoutHintIdToken,
  readStoredWebAuthSession,
  readStoredWebAuthSessionForLogout,
  startOktaAuthTransaction,
  touchWebAuthSession,
  touchStoredWebAuthSession,
  writeWebAuthTransaction,
  writeWebAuthSession,
} from '@acme-los/api/web-server';
import type { WebAuthSession } from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';

const TEST_SESSION: WebAuthSession = {
  provider: 'okta',
  status: 'authenticated',
  isAuthenticated: true,
  assuranceLevel: 'aal1',
  user: {
    id: 'customer-1',
    displayName: 'Ada Customer',
  },
};

const ENVIRONMENT_KEYS = [
  'ACME_WEB_STATE_STORE',
  'APP_ENVIRONMENT_NAME',
  'ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS',
  'ACME_WEB_SESSION_WARNING_SECONDS',
  'ACME_WEB_SESSION_ABSOLUTE_TIMEOUT_SECONDS',
  'ACME_AUTH_PROVIDER',
  'ACME_OKTA_ISSUER',
  'ACME_OKTA_CLIENT_ID',
  'ACME_OKTA_REDIRECT_URI',
  'ACME_OKTA_POST_LOGOUT_REDIRECT_URI',
  'ACME_OKTA_FUNDING_ACR_VALUES',
  'ACME_OKTA_FUNDING_STEP_UP_METHOD',
  'ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD',
  'NEXT_PUBLIC_OKTA_FUNDING_STEP_UP_METHOD',
  'ACME_BFF_BASE_URL',
  'ACME_BFF_URL',
  'ACME_BFF_PROXY_MODE',
] as const;

const originalEnvironment = new Map(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnvironment() {
  for (const key of ENVIRONMENT_KEYS) {
    const originalValue = originalEnvironment.get(key);

    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }
}

function createSessionRequest(sessionId: string): NextRequest {
  let authCookieValue = '';
  const request = {
    nextUrl: new URL('https://los.example.test/'),
  } as NextRequest;
  const response = {
    cookies: {
      set: ({ value }: { value: string }) => {
        authCookieValue = value;
      },
    },
  } as unknown as NextResponse;

  writeWebAuthSession(request, response, {
    storedSessionId: sessionId,
    maxAge: 60 * 10,
  });

  return {
    cookies: {
      get: (name: string) =>
        name === 'acme-los.auth-session'
          ? { name, value: authCookieValue }
          : undefined,
    },
  } as unknown as NextRequest;
}

function createRequestWithCookie(
  cookieName: string,
  cookieValue: string,
): NextRequest {
  return {
    nextUrl: new URL('https://los.example.test/'),
    cookies: {
      get: (name: string) =>
        name === cookieName ? { name, value: cookieValue } : undefined,
      has: (name: string) => name === cookieName,
    },
  } as unknown as NextRequest;
}

describe('web auth session store idle expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    process.env.ACME_WEB_STATE_STORE = 'file';
    process.env.APP_ENVIRONMENT_NAME = 'dev';
    delete process.env.ACME_BFF_BASE_URL;
    delete process.env.ACME_BFF_URL;
    process.env.ACME_BFF_PROXY_MODE = 'next';
  });

  afterEach(() => {
    restoreEnvironment();
    jest.useRealTimers();
  });

  it('treats the configured Okta funding ACR value as aal2 evidence', () => {
    expect(
      getAssuranceLevelFromAuthenticationEvidence({
        authenticationMethods: ['pwd'],
        acr: 'urn:okta:loa:2fa:any',
        acceptedHighAssuranceAcrValues: ['urn:okta:loa:2fa:any'],
      }),
    ).toBe('aal2');

    expect(
      getAssuranceLevelFromAuthenticationEvidence({
        authenticationMethods: ['pwd'],
        acr: 'urn:okta:loa:1fa:any',
        acceptedHighAssuranceAcrValues: ['urn:okta:loa:2fa:any'],
      }),
    ).toBe('aal1');
  });

  it('accepts email or phone evidence for funding step-up', () => {
    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'email_or_sms',
        authenticationMethods: ['pwd', 'sms'],
      }),
    ).toBe(true);

    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'email_or_sms',
        authenticationMethods: ['pwd', 'phone'],
      }),
    ).toBe(true);

    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'email_or_sms',
        authenticationMethods: ['pwd', 'email'],
      }),
    ).toBe(true);

    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'email',
        authenticationMethods: ['pwd', 'email'],
      }),
    ).toBe(true);

    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'sms',
        authenticationMethods: ['pwd', 'email'],
      }),
    ).toBe(false);

    expect(
      isFundingStepUpMethodSatisfied({
        fundingStepUpMethod: 'email_or_sms',
        authenticationMethods: ['pwd', 'totp'],
      }),
    ).toBe(false);
  });

  it('rejects a stored session after its idle expiry', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '2';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '1';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'id-token',
      },
      expiresAt: currentEpochSeconds + 60,
    });

    expect(storedSession.idleExpiresAt).toBe(currentEpochSeconds + 2);
    expect(
      await readStoredWebAuthSession(storedSession.sessionId),
    ).toBeTruthy();

    jest.setSystemTime(new Date('2026-04-21T12:00:03.000Z'));

    expect(await readStoredWebAuthSession(storedSession.sessionId)).toBeNull();
  });

  it('retains logout artifacts briefly after idle expiry without authenticating the session', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '2';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '1';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'id-token-for-logout',
      },
      expiresAt: currentEpochSeconds + 60,
    });

    expect(getStoredWebAuthSessionCookieMaxAge(storedSession)).toBeGreaterThan(
      2,
    );

    jest.setSystemTime(new Date('2026-04-21T12:00:03.000Z'));

    expect(await readStoredWebAuthSession(storedSession.sessionId)).toBeNull();
    expect(
      (await readStoredWebAuthSessionForLogout(storedSession.sessionId))?.tokens
        .idToken,
    ).toBe('id-token-for-logout');
  });

  it('can read the logout id token after idle expiry from the retained session cookie', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '2';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '1';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'id-token-for-redirect-logout',
      },
      expiresAt: currentEpochSeconds + 60,
    });
    const logoutRequest = createSessionRequest(storedSession.sessionId);

    jest.setSystemTime(new Date('2026-04-21T12:00:03.000Z'));

    expect(await readLogoutHintIdToken(logoutRequest)).toBe(
      'id-token-for-redirect-logout',
    );
  });

  it('retains logout artifacts after token expiry without keeping the app session active', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'id-token-expiring-at-session-boundary',
      },
      expiresAt: currentEpochSeconds + 2,
    });

    expect(storedSession.idleExpiresAt).toBe(currentEpochSeconds + 2);
    expect(getStoredWebAuthSessionCookieMaxAge(storedSession)).toBeGreaterThan(
      2,
    );

    jest.setSystemTime(new Date('2026-04-21T12:00:03.000Z'));

    expect(await readStoredWebAuthSession(storedSession.sessionId)).toBeNull();
    expect(
      (await readStoredWebAuthSessionForLogout(storedSession.sessionId))?.tokens
        .idToken,
    ).toBe('id-token-expiring-at-session-boundary');
  });

  it('refreshes server-side tokens during touch before the token boundary', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'old-id-token',
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        tokenType: 'Bearer',
        scope: 'openid profile email offline_access',
        expiresIn: 30,
      },
      expiresAt: currentEpochSeconds + 30,
    });
    const refreshOktaTokenSet = jest.fn().mockResolvedValue({
      id_token: 'new-id-token',
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      token_type: 'Bearer',
      scope: 'openid profile email offline_access',
      expires_in: 3600,
    });
    const verifyOktaIdToken = jest.fn().mockResolvedValue({
      exp: currentEpochSeconds + 3600,
      sub: 'customer-1',
      name: 'Ada Customer',
      email: 'ada@example.test',
      amr: ['pwd'],
    });

    const touchedSession = await touchWebAuthSession(
      createSessionRequest(storedSession.sessionId),
      {
        refreshOktaTokenSet,
        verifyOktaIdToken,
      },
    );
    const refreshedSession = await readStoredWebAuthSession(
      storedSession.sessionId,
    );

    expect(refreshOktaTokenSet).toHaveBeenCalledWith({
      refreshToken: 'old-refresh-token',
    });
    expect(verifyOktaIdToken).toHaveBeenCalledWith('new-id-token');
    expect(touchedSession?.response.sessionTiming?.absoluteExpiresAt).toBe(
      currentEpochSeconds + 3600,
    );
    expect(touchedSession?.response.sessionTiming?.idleExpiresAt).toBe(
      currentEpochSeconds + 120,
    );
    expect(refreshedSession?.tokens).toMatchObject({
      idToken: 'new-id-token',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });
  });

  it('keeps a configured absolute session cap anchored to the original session during refresh', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';
    process.env.ACME_WEB_SESSION_ABSOLUTE_TIMEOUT_SECONDS = '45';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'old-id-token',
        refreshToken: 'old-refresh-token',
      },
      expiresAt: currentEpochSeconds + 30,
    });
    const refreshOktaTokenSet = jest.fn().mockResolvedValue({
      id_token: 'new-id-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    });
    const verifyOktaIdToken = jest.fn().mockResolvedValue({
      exp: currentEpochSeconds + 3600,
      sub: 'customer-1',
      name: 'Ada Customer',
      amr: ['pwd'],
    });

    const touchedSession = await touchWebAuthSession(
      createSessionRequest(storedSession.sessionId),
      {
        refreshOktaTokenSet,
        verifyOktaIdToken,
      },
    );

    expect(touchedSession?.response.sessionTiming?.absoluteExpiresAt).toBe(
      currentEpochSeconds + 45,
    );
    expect(touchedSession?.response.sessionTiming?.idleExpiresAt).toBe(
      currentEpochSeconds + 45,
    );
  });

  it('rejects refreshed Okta tokens that do not include an immutable subject', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'old-id-token',
        refreshToken: 'old-refresh-token',
      },
      expiresAt: currentEpochSeconds + 30,
    });
    const refreshOktaTokenSet = jest.fn().mockResolvedValue({
      id_token: 'new-id-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    });
    const verifyOktaIdToken = jest.fn().mockResolvedValue({
      exp: currentEpochSeconds + 3600,
      email: 'ada@example.test',
      amr: ['pwd'],
    });

    await expect(
      touchWebAuthSession(createSessionRequest(storedSession.sessionId), {
        refreshOktaTokenSet,
        verifyOktaIdToken,
      }),
    ).rejects.toThrow(
      'The Okta ID token is missing the required subject claim.',
    );
  });

  it('retires the previous server auth session when callback writes a replacement session', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';

    const previousSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'previous-id-token',
      },
      expiresAt: currentEpochSeconds + 3600,
    });
    const replacementSession = await createStoredWebAuthSession({
      session: {
        ...TEST_SESSION,
        assuranceLevel: 'aal2',
      },
      tokens: {
        idToken: 'step-up-id-token',
      },
      expiresAt: currentEpochSeconds + 3600,
    });

    await clearReplacedWebAuthSession(
      createSessionRequest(previousSession.sessionId),
      replacementSession.sessionId,
    );

    expect(
      await readStoredWebAuthSession(previousSession.sessionId),
    ).toBeNull();
    expect(
      await readStoredWebAuthSession(replacementSession.sessionId),
    ).toBeTruthy();
  });

  it('binds funding step-up auth transactions without forcing password re-entry', () => {
    process.env.ACME_AUTH_PROVIDER = 'okta';
    process.env.ACME_OKTA_ISSUER = 'https://example.okta.com/oauth2/default';
    process.env.ACME_OKTA_CLIENT_ID = 'client-id';
    process.env.ACME_OKTA_REDIRECT_URI =
      'https://los.example.test/api/auth/callback';
    process.env.ACME_OKTA_POST_LOGOUT_REDIRECT_URI =
      'https://los.example.test/';
    process.env.ACME_OKTA_FUNDING_ACR_VALUES = 'urn:okta:loa:2fa:any';

    const transaction = startOktaAuthTransaction({
      returnTo: '/apply/funding',
      minimumAssuranceLevel: 'aal2',
      expectedUserId: 'customer-1',
      stepUp: {
        reason: 'funding',
        maxAgeSeconds: 10 * 60,
      },
    });
    const authorizeUrl = new URL(transaction.authorizeUrl);

    expect(transaction.maxAge).toBe(30 * 60);
    expect(transaction.cookiePayload).toEqual({
      transactionId: transaction.transactionId,
      returnTo: '/apply/funding',
      minimumAssuranceLevel: 'aal2',
      expiresAt: transaction.storedTransaction.expiresAt,
    });
    expect(transaction.storedTransaction.expectedUserId).toBe('customer-1');
    expect(transaction.storedTransaction.codeVerifier).toEqual(
      expect.any(String),
    );
    expect(transaction.storedTransaction.nonce).toEqual(expect.any(String));
    expect(authorizeUrl.searchParams.get('acr_values')).toBe(
      'urn:okta:loa:2fa:any',
    );
    expect(authorizeUrl.searchParams.has('prompt')).toBe(false);
    expect(authorizeUrl.searchParams.has('max_age')).toBe(false);
    expect(transaction.storedTransaction.stepUp).toEqual({
      reason: 'funding',
      maxAgeSeconds: 10 * 60,
    });
  });

  it('can explicitly force password re-entry for funding step-up when configured', () => {
    process.env.ACME_AUTH_PROVIDER = 'okta';
    process.env.ACME_OKTA_ISSUER = 'https://example.okta.com/oauth2/default';
    process.env.ACME_OKTA_CLIENT_ID = 'client-id';
    process.env.ACME_OKTA_REDIRECT_URI =
      'https://los.example.test/api/auth/callback';
    process.env.ACME_OKTA_POST_LOGOUT_REDIRECT_URI =
      'https://los.example.test/';
    process.env.ACME_OKTA_FUNDING_ACR_VALUES = 'urn:okta:loa:2fa:any';
    process.env.ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD = 'true';

    const transaction = startOktaAuthTransaction({
      returnTo: '/apply/funding',
      minimumAssuranceLevel: 'aal2',
      expectedUserId: 'customer-1',
      stepUp: {
        reason: 'funding',
        maxAgeSeconds: 10 * 60,
      },
    });
    const authorizeUrl = new URL(transaction.authorizeUrl);

    expect(authorizeUrl.searchParams.get('acr_values')).toBe(
      'urn:okta:loa:2fa:any',
    );
    expect(authorizeUrl.searchParams.get('max_age')).toBe('0');
  });

  it('passes supported hosted widget flow selectors to Okta authorize', () => {
    process.env.ACME_AUTH_PROVIDER = 'okta';
    process.env.ACME_OKTA_ISSUER = 'https://example.okta.com/oauth2/default';
    process.env.ACME_OKTA_CLIENT_ID = 'client-id';
    process.env.ACME_OKTA_REDIRECT_URI =
      'https://los.example.test/api/auth/callback';
    process.env.ACME_OKTA_POST_LOGOUT_REDIRECT_URI =
      'https://los.example.test/';

    const transaction = startOktaAuthTransaction({
      returnTo: '/account/profile',
      widgetFlow: 'resetPassword',
    });
    const authorizeUrl = new URL(transaction.authorizeUrl);

    expect(authorizeUrl.searchParams.get('acme_widget_flow')).toBe(
      'resetPassword',
    );
    expect(transaction.storedTransaction.returnTo).toBe('/account/profile');
  });

  it('stores PKCE transaction details server-side and consumes them once', async () => {
    process.env.ACME_AUTH_PROVIDER = 'okta';
    process.env.ACME_OKTA_ISSUER = 'https://example.okta.com/oauth2/default';
    process.env.ACME_OKTA_CLIENT_ID = 'client-id';
    process.env.ACME_OKTA_REDIRECT_URI =
      'https://los.example.test/api/auth/callback';
    process.env.ACME_OKTA_POST_LOGOUT_REDIRECT_URI =
      'https://los.example.test/';

    const transaction = startOktaAuthTransaction({
      returnTo: '/apply/personal-info',
      leadId: 'lead-123',
    });
    let authTransactionCookieValue = '';
    const request = {
      nextUrl: new URL('https://los.example.test/'),
    } as NextRequest;
    const response = {
      cookies: {
        set: ({ value }: { value: string }) => {
          authTransactionCookieValue = value;
        },
      },
    } as unknown as NextResponse;

    await writeWebAuthTransaction(request, response, transaction);

    const callbackRequest = createRequestWithCookie(
      'acme-los.auth-transaction',
      authTransactionCookieValue,
    );
    const cookiePayload = readWebAuthTransactionCookie(callbackRequest);
    const storedTransaction = await readWebAuthTransaction(callbackRequest);

    expect(transaction.maxAge).toBe(30 * 60);
    expect(cookiePayload).toEqual({
      transactionId: transaction.transactionId,
      returnTo: '/apply/personal-info',
      minimumAssuranceLevel: 'aal1',
      expiresAt: transaction.storedTransaction.expiresAt,
    });
    expect(JSON.stringify(cookiePayload)).not.toContain(
      transaction.storedTransaction.codeVerifier,
    );
    expect(storedTransaction).toMatchObject({
      transactionId: transaction.transactionId,
      state: transaction.storedTransaction.state,
      nonce: transaction.storedTransaction.nonce,
      codeVerifier: transaction.storedTransaction.codeVerifier,
      leadId: 'lead-123',
      returnTo: '/apply/personal-info',
    });

    await deleteStoredWebAuthTransaction(storedTransaction);

    expect(await readWebAuthTransaction(callbackRequest)).toBeNull();
  });

  it('stores and expires a fresh funding step-up marker separately from the session', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '120';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '30';

    const storedSession = await createStoredWebAuthSession({
      session: {
        ...TEST_SESSION,
        assuranceLevel: 'aal2',
      },
      tokens: {
        idToken: 'fresh-funding-step-up-id-token',
      },
      expiresAt: currentEpochSeconds + 3600,
      stepUp: {
        reason: 'funding',
        maxAgeSeconds: 60,
      },
    });

    expect(storedSession.stepUp).toEqual({
      reason: 'funding',
      completedAt: currentEpochSeconds,
      expiresAt: currentEpochSeconds + 60,
    });
    expect(getStoredWebAuthSessionTiming(storedSession).stepUp).toEqual({
      reason: 'funding',
      completedAt: currentEpochSeconds,
      expiresAt: currentEpochSeconds + 60,
    });
    expect(
      isStoredWebAuthStepUpFresh(storedSession, {
        reason: 'funding',
        maxAgeSeconds: 60,
      }),
    ).toBe(true);

    jest.setSystemTime(new Date('2026-04-21T12:01:01.000Z'));

    const activeStoredSession = await readStoredWebAuthSession(
      storedSession.sessionId,
    );
    expect(activeStoredSession).toBeTruthy();
    if (!activeStoredSession) {
      throw new Error('Expected funding step-up session to remain active.');
    }

    expect(
      isStoredWebAuthStepUpFresh(activeStoredSession, {
        reason: 'funding',
        maxAgeSeconds: 60,
      }),
    ).toBe(false);
  });

  it('consumes funding page step-up while preserving the API step-up window', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    const routeRequirement = {
      reason: 'funding' as const,
      maxAgeSeconds: 60,
      consumeOnSatisfied: true,
    };
    const apiRequirement = {
      reason: 'funding' as const,
      maxAgeSeconds: 60,
    };

    const storedSession = await createStoredWebAuthSession({
      session: {
        ...TEST_SESSION,
        assuranceLevel: 'aal2',
      },
      tokens: {
        idToken: 'fresh-funding-step-up-id-token',
      },
      expiresAt: currentEpochSeconds + 3600,
      stepUp: routeRequirement,
    });

    expect(isStoredWebAuthStepUpFresh(storedSession, routeRequirement)).toBe(
      true,
    );

    const consumedSession = await consumeStoredWebAuthStepUp(
      storedSession,
      routeRequirement,
    );

    expect(consumedSession.stepUp).toEqual({
      reason: 'funding',
      completedAt: currentEpochSeconds,
      expiresAt: currentEpochSeconds + 60,
      consumedAt: currentEpochSeconds,
    });
    expect(isStoredWebAuthStepUpFresh(consumedSession, routeRequirement)).toBe(
      false,
    );
    expect(isStoredWebAuthStepUpFresh(consumedSession, apiRequirement)).toBe(
      true,
    );
  });

  it('extends idle expiry on an explicit touch without changing absolute expiry', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    process.env.ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS = '10';
    process.env.ACME_WEB_SESSION_WARNING_SECONDS = '1';

    const storedSession = await createStoredWebAuthSession({
      session: TEST_SESSION,
      tokens: {
        idToken: 'id-token',
      },
      expiresAt: currentEpochSeconds + 60,
    });

    jest.setSystemTime(new Date('2026-04-21T12:00:05.000Z'));

    const touchedSession = await touchStoredWebAuthSession(
      storedSession.sessionId,
    );

    expect(touchedSession?.expiresAt).toBe(storedSession.expiresAt);
    expect(touchedSession?.idleExpiresAt).toBe(currentEpochSeconds + 15);

    jest.setSystemTime(new Date('2026-04-21T12:00:11.000Z'));

    expect(
      await readStoredWebAuthSession(storedSession.sessionId),
    ).toBeTruthy();

    jest.setSystemTime(new Date('2026-04-21T12:00:16.000Z'));

    expect(await readStoredWebAuthSession(storedSession.sessionId)).toBeNull();
  });
});

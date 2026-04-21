import {
  createStoredWebAuthSession,
  readStoredWebAuthSession,
  touchStoredWebAuthSession,
} from '@acme-los/api/web-server';
import type { WebAuthSession } from '@acme-los/api/contracts';

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

describe('web auth session store idle expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    process.env.ACME_WEB_STATE_STORE = 'file';
    process.env.APP_ENVIRONMENT_NAME = 'dev';
  });

  afterEach(() => {
    restoreEnvironment();
    jest.useRealTimers();
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

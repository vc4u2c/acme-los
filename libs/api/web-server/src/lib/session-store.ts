import type { WebAuthSession } from '@acme-los/api/contracts';
import { createRandomToken } from './cookies';
import {
  deleteStateValue,
  readStateValue,
  writeStateValue,
} from './state-store';
import {
  buildWebAuthSessionTiming,
  getWebSessionTimeoutConfig,
  resolveAbsoluteSessionExpiresAt,
} from './session-timeout';

const AUTH_SESSION_NAMESPACE = 'auth-session';

export type StoredWebAuthTokenSet = {
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
};

export type StoredWebAuthSession = {
  sessionId: string;
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
  expiresAt: number;
  createdAt: number;
  lastActivityAt: number;
  idleExpiresAt: number;
};

type PersistedStoredWebAuthSession = Omit<
  StoredWebAuthSession,
  'lastActivityAt' | 'idleExpiresAt'
> &
  Partial<Pick<StoredWebAuthSession, 'lastActivityAt' | 'idleExpiresAt'>>;

type CreateStoredWebAuthSessionInput = {
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
  expiresAt: number;
};

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getSessionTtlSeconds(storedSession: StoredWebAuthSession): number {
  const expiresAt = Math.min(
    storedSession.expiresAt,
    storedSession.idleExpiresAt,
  );

  return Math.max(expiresAt - getCurrentEpochSeconds(), 1);
}

function getCreatedAtEpochSeconds(createdAt: number): number {
  return createdAt > 10_000_000_000
    ? Math.floor(createdAt / 1000)
    : Math.floor(createdAt);
}

function normalizeStoredSession(
  storedSession: PersistedStoredWebAuthSession,
): StoredWebAuthSession {
  const { idleTimeoutSeconds } = getWebSessionTimeoutConfig();
  const lastActivityAt =
    storedSession.lastActivityAt ??
    getCreatedAtEpochSeconds(storedSession.createdAt);
  const idleExpiresAt =
    storedSession.idleExpiresAt ??
    Math.min(storedSession.expiresAt, lastActivityAt + idleTimeoutSeconds);

  return {
    ...storedSession,
    lastActivityAt,
    idleExpiresAt,
  };
}

function isStoredSessionExpired(storedSession: StoredWebAuthSession): boolean {
  const currentEpochSeconds = getCurrentEpochSeconds();

  return (
    storedSession.expiresAt <= currentEpochSeconds ||
    storedSession.idleExpiresAt <= currentEpochSeconds
  );
}

export async function createStoredWebAuthSession(
  input: CreateStoredWebAuthSessionInput,
): Promise<StoredWebAuthSession> {
  const sessionId = createRandomToken();
  const currentEpochSeconds = getCurrentEpochSeconds();
  const expiresAt = resolveAbsoluteSessionExpiresAt(
    input.expiresAt,
    currentEpochSeconds,
  );
  const { idleTimeoutSeconds } = getWebSessionTimeoutConfig();
  const storedSession: StoredWebAuthSession = {
    sessionId,
    session: input.session,
    tokens: input.tokens,
    expiresAt,
    createdAt: Date.now(),
    lastActivityAt: currentEpochSeconds,
    idleExpiresAt: Math.min(
      expiresAt,
      currentEpochSeconds + idleTimeoutSeconds,
    ),
  };

  await writeStateValue(
    AUTH_SESSION_NAMESPACE,
    sessionId,
    storedSession,
    getSessionTtlSeconds(storedSession),
  );

  return storedSession;
}

export async function readStoredWebAuthSession(
  sessionId: string,
): Promise<StoredWebAuthSession | null> {
  const persistedSession = await readStateValue<PersistedStoredWebAuthSession>(
    AUTH_SESSION_NAMESPACE,
    sessionId,
  );

  if (!persistedSession) {
    return null;
  }

  const storedSession = normalizeStoredSession(persistedSession);

  if (isStoredSessionExpired(storedSession)) {
    await deleteStateValue(AUTH_SESSION_NAMESPACE, sessionId);
    return null;
  }

  return storedSession;
}

export async function clearStoredWebAuthSession(
  sessionId: string,
): Promise<void> {
  await deleteStateValue(AUTH_SESSION_NAMESPACE, sessionId);
}

export async function touchStoredWebAuthSession(
  sessionId: string,
): Promise<StoredWebAuthSession | null> {
  const storedSession = await readStoredWebAuthSession(sessionId);

  if (!storedSession) {
    return null;
  }

  const currentEpochSeconds = getCurrentEpochSeconds();
  const { idleTimeoutSeconds } = getWebSessionTimeoutConfig();
  const nextStoredSession: StoredWebAuthSession = {
    ...storedSession,
    lastActivityAt: currentEpochSeconds,
    idleExpiresAt: Math.min(
      storedSession.expiresAt,
      currentEpochSeconds + idleTimeoutSeconds,
    ),
  };

  await writeStateValue(
    AUTH_SESSION_NAMESPACE,
    sessionId,
    nextStoredSession,
    getSessionTtlSeconds(nextStoredSession),
  );

  return nextStoredSession;
}

export function getStoredWebAuthSessionCookieMaxAge(
  storedSession: StoredWebAuthSession,
): number {
  return getSessionTtlSeconds(storedSession);
}

export function getStoredWebAuthSessionTiming(
  storedSession: StoredWebAuthSession,
) {
  return buildWebAuthSessionTiming({
    absoluteExpiresAt: storedSession.expiresAt,
    idleExpiresAt: storedSession.idleExpiresAt,
  });
}

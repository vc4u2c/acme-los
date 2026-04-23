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
const LOGOUT_ARTIFACT_GRACE_SECONDS = 5 * 60;

export type StoredWebAuthTokenSet = {
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
};

export type StoredWebAuthStepUpReason = 'funding';

export type StoredWebAuthStepUpRequirement = {
  reason: StoredWebAuthStepUpReason;
  maxAgeSeconds: number;
  consumeOnSatisfied?: boolean;
};

export type StoredWebAuthStepUp = {
  reason: StoredWebAuthStepUpReason;
  completedAt: number;
  expiresAt: number;
  consumedAt?: number;
};

export type StoredWebAuthSession = {
  sessionId: string;
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
  expiresAt: number;
  createdAt: number;
  lastActivityAt: number;
  idleExpiresAt: number;
  stepUp?: StoredWebAuthStepUp;
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
  stepUp?: StoredWebAuthStepUpRequirement;
};

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getActiveSessionExpiresAt(
  storedSession: StoredWebAuthSession,
): number {
  return Math.min(storedSession.expiresAt, storedSession.idleExpiresAt);
}

function getSessionRetentionTtlSeconds(
  storedSession: StoredWebAuthSession,
): number {
  const retainedUntil =
    getActiveSessionExpiresAt(storedSession) + LOGOUT_ARTIFACT_GRACE_SECONDS;

  return Math.max(retainedUntil - getCurrentEpochSeconds(), 1);
}

function getCreatedAtEpochSeconds(createdAt: number): number {
  return createdAt > 10_000_000_000
    ? Math.floor(createdAt / 1000)
    : Math.floor(createdAt);
}

function createStoredWebAuthStepUp(
  requirement: StoredWebAuthStepUpRequirement,
  currentEpochSeconds: number,
): StoredWebAuthStepUp {
  return {
    reason: requirement.reason,
    completedAt: currentEpochSeconds,
    expiresAt: currentEpochSeconds + requirement.maxAgeSeconds,
  };
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

function isStoredSessionAbsolutelyExpired(
  storedSession: StoredWebAuthSession,
): boolean {
  const currentEpochSeconds = getCurrentEpochSeconds();

  return storedSession.expiresAt <= currentEpochSeconds;
}

function isStoredSessionIdleExpired(
  storedSession: StoredWebAuthSession,
): boolean {
  return storedSession.idleExpiresAt <= getCurrentEpochSeconds();
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
    stepUp: input.stepUp
      ? createStoredWebAuthStepUp(input.stepUp, currentEpochSeconds)
      : undefined,
  };

  await writeStoredWebAuthSession(storedSession);

  return storedSession;
}

export async function writeStoredWebAuthSession(
  storedSession: StoredWebAuthSession,
): Promise<void> {
  await writeStateValue(
    AUTH_SESSION_NAMESPACE,
    storedSession.sessionId,
    storedSession,
    getSessionRetentionTtlSeconds(storedSession),
  );
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

  if (
    isStoredSessionAbsolutelyExpired(storedSession) ||
    isStoredSessionIdleExpired(storedSession)
  ) {
    return null;
  }

  return storedSession;
}

export async function readStoredWebAuthSessionForLogout(
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

  return storedSession;
}

export async function clearStoredWebAuthSession(
  sessionId: string,
): Promise<void> {
  await deleteStateValue(AUTH_SESSION_NAMESPACE, sessionId);
}

export function isStoredWebAuthStepUpFresh(
  storedSession: StoredWebAuthSession,
  requirement: StoredWebAuthStepUpRequirement,
): boolean {
  const stepUp = storedSession.stepUp;

  if (!stepUp || stepUp.reason !== requirement.reason) {
    return false;
  }

  if (stepUp.expiresAt <= getCurrentEpochSeconds()) {
    return false;
  }

  if (
    requirement.consumeOnSatisfied &&
    typeof stepUp.consumedAt === 'number' &&
    stepUp.consumedAt >= stepUp.completedAt
  ) {
    return false;
  }

  return true;
}

export async function consumeStoredWebAuthStepUp(
  storedSession: StoredWebAuthSession,
  requirement: StoredWebAuthStepUpRequirement,
): Promise<StoredWebAuthSession> {
  if (!requirement.consumeOnSatisfied) {
    return storedSession;
  }

  const stepUp = storedSession.stepUp;
  if (!stepUp || stepUp.reason !== requirement.reason) {
    return storedSession;
  }

  const nextStoredSession: StoredWebAuthSession = {
    ...storedSession,
    stepUp: {
      ...stepUp,
      consumedAt: getCurrentEpochSeconds(),
    },
  };

  await writeStoredWebAuthSession(nextStoredSession);

  return nextStoredSession;
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

  await writeStoredWebAuthSession(nextStoredSession);

  return nextStoredSession;
}

export function getStoredWebAuthSessionCookieMaxAge(
  storedSession: StoredWebAuthSession,
): number {
  return getSessionRetentionTtlSeconds(storedSession);
}

export function getStoredWebAuthSessionTiming(
  storedSession: StoredWebAuthSession,
) {
  return buildWebAuthSessionTiming({
    absoluteExpiresAt: storedSession.expiresAt,
    idleExpiresAt: storedSession.idleExpiresAt,
  });
}

import type { WebAuthSession } from '@acme-los/api/contracts';
import { createRandomToken } from './cookies';
import {
  deleteStateValue,
  readStateValue,
  writeStateValue,
} from './state-store';

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
};

type CreateStoredWebAuthSessionInput = {
  session: WebAuthSession;
  tokens: StoredWebAuthTokenSet;
  expiresAt: number;
};

function getSessionTtlSeconds(expiresAt: number): number {
  return Math.max(expiresAt - Math.floor(Date.now() / 1000), 60);
}

export async function createStoredWebAuthSession(
  input: CreateStoredWebAuthSessionInput,
): Promise<StoredWebAuthSession> {
  const sessionId = createRandomToken();
  const storedSession: StoredWebAuthSession = {
    sessionId,
    session: input.session,
    tokens: input.tokens,
    expiresAt: input.expiresAt,
    createdAt: Date.now(),
  };

  await writeStateValue(
    AUTH_SESSION_NAMESPACE,
    sessionId,
    storedSession,
    getSessionTtlSeconds(input.expiresAt),
  );

  return storedSession;
}

export async function readStoredWebAuthSession(
  sessionId: string,
): Promise<StoredWebAuthSession | null> {
  const storedSession = await readStateValue<StoredWebAuthSession>(
    AUTH_SESSION_NAMESPACE,
    sessionId,
  );

  if (!storedSession) {
    return null;
  }

  if (storedSession.expiresAt <= Math.floor(Date.now() / 1000)) {
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

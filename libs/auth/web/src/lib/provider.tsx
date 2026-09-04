'use client';

import * as React from 'react';
import type {
  AuthAssuranceLevel,
  AuthSession,
  SignInRequest,
} from '@acme-los/auth/contracts';
import type { WebAuthSessionTiming } from '@acme-los/api/contracts';
import { createWebApiClient } from '@acme-los/api/web-client';
import {
  EMPTY_AUTH_SESSION,
  getSafeAuthReturnTo,
  isAssuranceSatisfied,
} from '@acme-los/auth/core';

type AuthContextValue = {
  session: AuthSession;
  signIn: (request?: SignInRequest) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  touchSession: () => Promise<boolean>;
  sessionTiming: WebAuthSessionTiming | null;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function toUnauthenticatedSession(errorMessage?: string): AuthSession {
  return {
    provider: 'okta',
    status: errorMessage ? 'error' : 'unauthenticated',
    isAuthenticated: false,
    assuranceLevel: 'anonymous',
    user: null,
    errorMessage,
  };
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [session, setSession] = React.useState<AuthSession>(EMPTY_AUTH_SESSION);
  const [sessionTiming, setSessionTiming] =
    React.useState<WebAuthSessionTiming | null>(null);

  const refreshSession = React.useCallback(async () => {
    try {
      const serverSession = await webApiClient.auth.getSession();

      if (serverSession.session.isAuthenticated && serverSession.session.user) {
        setSession(serverSession.session);
        setSessionTiming(serverSession.sessionTiming ?? null);
        return;
      }

      setSession(toUnauthenticatedSession());
      setSessionTiming(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load auth session.';
      setSession(toUnauthenticatedSession(message));
      setSessionTiming(null);
    }
  }, [webApiClient]);

  React.useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signIn = React.useCallback(async (request?: SignInRequest) => {
    const minimumAssuranceLevel = request?.minimumAssuranceLevel ?? 'aal1';
    const returnTo = getSafeAuthReturnTo(request?.returnTo);
    const searchParams = new URLSearchParams({ returnTo });

    if (minimumAssuranceLevel === 'aal2') {
      searchParams.set('aal', 'aal2');
    }

    window.location.assign(`/account/sign-in?${searchParams.toString()}`);
  }, []);

  const signOut = React.useCallback(async () => {
    setSession(toUnauthenticatedSession());
    setSessionTiming(null);
    window.location.assign('/api/auth/logout');
  }, []);

  const touchSession = React.useCallback(async () => {
    try {
      const touchedSession = await webApiClient.auth.touchSession();

      if (
        touchedSession.session.isAuthenticated &&
        touchedSession.session.user
      ) {
        setSession(touchedSession.session);
        setSessionTiming(touchedSession.sessionTiming ?? null);
        return true;
      }

      setSession(toUnauthenticatedSession());
      setSessionTiming(null);
      return false;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to keep the auth session active.';
      setSession(toUnauthenticatedSession(message));
      setSessionTiming(null);
      return false;
    }
  }, [webApiClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      sessionTiming,
      signIn,
      signOut,
      refreshSession,
      touchSession,
    }),
    [refreshSession, session, sessionTiming, signIn, signOut, touchSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthContextValue {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthProvider.');
  }

  return context;
}

export function useAuthRequirementSatisfied(
  minimumAssuranceLevel: Exclude<AuthAssuranceLevel, 'anonymous'> = 'aal1',
): boolean {
  const { session } = useAuthSession();

  return (
    session.status === 'authenticated' &&
    isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel)
  );
}

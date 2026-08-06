'use client';

import * as React from 'react';
import type {
  AuthAssuranceLevel,
  AuthSession,
  AuthUser,
  SignInRequest,
} from '@acme-los/auth/contracts';
import type { WebAuthSessionTiming } from '@acme-los/api/contracts';
import { createWebApiClient } from '@acme-los/api/web-client';
import {
  createMockAuthUser,
  EMPTY_AUTH_SESSION,
  getAssuranceLevelFromAuthenticationMethods,
  getSafeAuthReturnTo,
  isAssuranceSatisfied,
  MOCK_AUTH_STORAGE_KEY,
} from '@acme-los/auth/core';
import { getWebAuthConfig } from './config';

type AuthContextValue = {
  session: AuthSession;
  signIn: (request?: SignInRequest) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  touchSession: () => Promise<boolean>;
  sessionTiming: WebAuthSessionTiming | null;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function toAuthenticatedSession(
  user: AuthUser,
  provider: AuthSession['provider'],
): AuthSession {
  return {
    provider,
    status: 'authenticated',
    isAuthenticated: true,
    assuranceLevel: getAssuranceLevelFromAuthenticationMethods(
      user.authenticationMethods,
    ),
    user,
  };
}

function toUnauthenticatedSession(
  provider: AuthSession['provider'],
  errorMessage?: string,
): AuthSession {
  return {
    provider,
    status: errorMessage ? 'error' : 'unauthenticated',
    isAuthenticated: false,
    assuranceLevel: 'anonymous',
    user: null,
    errorMessage,
  };
}

function readMockSession(): AuthSession {
  if (typeof window === 'undefined') {
    return EMPTY_AUTH_SESSION;
  }

  const rawValue = window.sessionStorage.getItem(MOCK_AUTH_STORAGE_KEY);
  const rawCookieValue = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${MOCK_AUTH_STORAGE_KEY}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  const sessionSource = rawValue ?? rawCookieValue;
  if (!sessionSource) {
    return toUnauthenticatedSession('mock');
  }

  try {
    const parsedUser = JSON.parse(
      rawValue ?? decodeURIComponent(rawCookieValue ?? ''),
    ) as AuthUser;
    return toAuthenticatedSession(parsedUser, 'mock');
  } catch {
    window.sessionStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
    document.cookie = `${MOCK_AUTH_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
    return toUnauthenticatedSession('mock');
  }
}

function persistMockUser(user: AuthUser) {
  if (typeof window === 'undefined') {
    return;
  }

  const serializedUser = JSON.stringify(user);
  window.sessionStorage.setItem(MOCK_AUTH_STORAGE_KEY, serializedUser);
  document.cookie = `${MOCK_AUTH_STORAGE_KEY}=${encodeURIComponent(serializedUser)}; Path=/; SameSite=Lax`;
}

function clearLocalSessionArtifacts() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
  document.cookie = `${MOCK_AUTH_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const config = React.useMemo(() => getWebAuthConfig(), []);
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [session, setSession] = React.useState<AuthSession>({
    ...EMPTY_AUTH_SESSION,
    provider: config.provider,
  });
  const [sessionTiming, setSessionTiming] =
    React.useState<WebAuthSessionTiming | null>(null);

  const refreshSession = React.useCallback(async () => {
    if (config.provider === 'mock') {
      setSession(readMockSession());
      setSessionTiming(null);
      return;
    }

    if (config.configurationError) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      setSessionTiming(null);
      return;
    }

    try {
      const serverSession = await webApiClient.auth.getSession();

      if (serverSession.session.isAuthenticated) {
        setSession(serverSession.session);
        setSessionTiming(serverSession.sessionTiming ?? null);
        return;
      }

      setSession(toUnauthenticatedSession('okta'));
      setSessionTiming(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load auth session.';
      setSession(toUnauthenticatedSession('okta', message));
      setSessionTiming(null);
    }
  }, [config, webApiClient]);

  React.useEffect(() => {
    if (config.provider === 'mock') {
      setSession(readMockSession());
      setSessionTiming(null);
      return;
    }

    if (config.configurationError) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      setSessionTiming(null);
      return;
    }

    void refreshSession();
  }, [config, refreshSession]);

  const signIn = React.useCallback(
    async (request?: SignInRequest) => {
      const minimumAssuranceLevel = request?.minimumAssuranceLevel ?? 'aal1';
      const returnTo = getSafeAuthReturnTo(request?.returnTo);

      if (config.provider === 'mock') {
        const nextUser = createMockAuthUser(minimumAssuranceLevel);
        persistMockUser(nextUser);
        setSession(toAuthenticatedSession(nextUser, 'mock'));
        setSessionTiming(null);
        window.location.assign(returnTo);
        return;
      }

      if (config.configurationError) {
        setSession(toUnauthenticatedSession('okta', config.configurationError));
        setSessionTiming(null);
        return;
      }

      try {
        const searchParams = new URLSearchParams({
          returnTo,
        });

        if (minimumAssuranceLevel === 'aal2') {
          searchParams.set('aal', 'aal2');
        }

        window.location.assign(`/account/sign-in?${searchParams.toString()}`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to start the secure sign-in redirect.';
        setSession(toUnauthenticatedSession('okta', message));
        setSessionTiming(null);
      }
    },
    [config],
  );

  const signOut = React.useCallback(async () => {
    clearLocalSessionArtifacts();
    setSessionTiming(null);

    if (config.provider === 'mock') {
      setSession(toUnauthenticatedSession('mock'));
      window.location.assign('/');
      return;
    }

    if (config.configurationError) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      window.location.assign('/');
      return;
    }
    setSession(toUnauthenticatedSession('okta'));

    window.location.assign('/api/auth/logout');
  }, [config]);

  const touchSession = React.useCallback(async () => {
    if (config.provider === 'mock') {
      setSession(readMockSession());
      setSessionTiming(null);
      return true;
    }

    if (config.configurationError) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      setSessionTiming(null);
      return false;
    }

    try {
      const touchedSession = await webApiClient.auth.touchSession();

      if (touchedSession.session.isAuthenticated) {
        setSession(touchedSession.session);
        setSessionTiming(touchedSession.sessionTiming ?? null);
        return true;
      }

      setSession(toUnauthenticatedSession('okta'));
      setSessionTiming(null);
      return false;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to keep the auth session active.';
      setSession(toUnauthenticatedSession('okta', message));
      setSessionTiming(null);
      return false;
    }
  }, [config, webApiClient]);

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

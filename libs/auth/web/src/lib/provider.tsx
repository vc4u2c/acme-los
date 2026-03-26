'use client';

import * as React from 'react';
import type {
  AuthAssuranceLevel,
  AuthSession,
  AuthUser,
  SignInRequest,
} from '@acme-los/auth/contracts';
import { createWebApiClient } from '@acme-los/api/web-client';
import {
  createMockAuthUser,
  EMPTY_AUTH_SESSION,
  getAssuranceLevelFromAuthenticationMethods,
  isAssuranceSatisfied,
  LOCAL_DRAFT_STORAGE_KEY,
  MOCK_AUTH_STORAGE_KEY,
} from '@acme-los/auth/core';
import { getWebAuthConfig } from './config';
import { getStoredLeadId } from './lead-id';
import { getOktaAuthClient } from './okta-client';
import { parseJwtClaims } from './token-claims';

type AuthContextValue = {
  session: AuthSession;
  signIn: (request?: SignInRequest) => Promise<void>;
  signOut: () => Promise<void>;
  handleCallback: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const firstApplicationStepPath = '/apply/personal-info';
let authRedirectInFlight = false;

function normalizeReturnTo(returnTo: string): string {
  if (returnTo === '/apply') {
    return firstApplicationStepPath;
  }

  if (returnTo.startsWith('/apply?')) {
    return `${firstApplicationStepPath}${returnTo.slice('/apply'.length)}`;
  }

  return returnTo;
}

function getSafeReturnTo(returnTo?: string): string {
  if (!returnTo || !returnTo.startsWith('/')) {
    return firstApplicationStepPath;
  }

  return normalizeReturnTo(returnTo);
}

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

  window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
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

  const refreshSession = React.useCallback(async () => {
    if (config.provider === 'mock') {
      setSession(readMockSession());
      return;
    }

    if (config.configurationError || !config.okta) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      return;
    }

    try {
      const serverSession = await webApiClient.auth.getSession();

      if (serverSession.session.isAuthenticated) {
        setSession(serverSession.session);
        return;
      }

      setSession(toUnauthenticatedSession('okta'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load auth session.';
      setSession(toUnauthenticatedSession('okta', message));
    }
  }, [config, webApiClient]);

  React.useEffect(() => {
    if (config.provider === 'mock') {
      setSession(readMockSession());
      return;
    }

    if (config.configurationError || !config.okta) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      return;
    }

    const oktaAuth = getOktaAuthClient(config.okta);
    if (typeof window !== 'undefined' && oktaAuth.isLoginRedirect()) {
      return;
    }

    void refreshSession();
  }, [config, refreshSession]);

  const signIn = React.useCallback(
    async (request?: SignInRequest) => {
      const minimumAssuranceLevel = request?.minimumAssuranceLevel ?? 'aal1';
      const returnTo = getSafeReturnTo(request?.returnTo);

      if (config.provider === 'mock') {
        const nextUser = createMockAuthUser(minimumAssuranceLevel);
        persistMockUser(nextUser);
        setSession(toAuthenticatedSession(nextUser, 'mock'));
        window.location.assign(returnTo);
        return;
      }

      if (config.configurationError || !config.okta) {
        setSession(toUnauthenticatedSession('okta', config.configurationError));
        return;
      }

      const oktaAuth = getOktaAuthClient(config.okta);
      if (authRedirectInFlight) {
        return;
      }

      authRedirectInFlight = true;
      oktaAuth.setOriginalUri(returnTo);

      try {
        await oktaAuth.signInWithRedirect({
          originalUri: returnTo,
          acrValues:
            minimumAssuranceLevel === 'aal2'
              ? config.okta.fundingStepUpAcrValues
              : undefined,
        });
      } catch (error) {
        authRedirectInFlight = false;
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to start the secure sign-in redirect.';
        setSession(toUnauthenticatedSession('okta', message));
      }
    },
    [config],
  );

  const signOut = React.useCallback(async () => {
    clearLocalSessionArtifacts();

    if (config.provider === 'mock') {
      setSession(toUnauthenticatedSession('mock'));
      window.location.assign('/');
      return;
    }

    if (config.configurationError || !config.okta) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      window.location.assign('/');
      return;
    }

    const oktaAuth = getOktaAuthClient(config.okta);
    setSession(toUnauthenticatedSession('okta'));

    oktaAuth.tokenManager.clear();
    oktaAuth.clearStorage();
    try {
      await webApiClient.auth.clearSession();
    } catch {
      // Fall through to the logout route, which also clears cookies.
    }
    window.location.assign('/api/auth/logout');
  }, [config, webApiClient]);

  const handleCallback = React.useCallback(async () => {
    if (config.provider === 'mock') {
      window.location.assign(firstApplicationStepPath);
      return;
    }

    if (config.configurationError || !config.okta) {
      setSession(toUnauthenticatedSession('okta', config.configurationError));
      return;
    }

    try {
      const oktaAuth = getOktaAuthClient(config.okta);
      await oktaAuth.storeTokensFromRedirect();
      const originalUri = getSafeReturnTo(
        oktaAuth.getOriginalUri() ?? firstApplicationStepPath,
      );
      oktaAuth.removeOriginalUri();
      const tokens = await oktaAuth.tokenManager.getTokens();

      if (!tokens.idToken?.idToken) {
        throw new Error('Unable to capture the Okta id token after callback.');
      }

      await webApiClient.auth.syncSession({
        idToken: tokens.idToken.idToken,
        leadId: getStoredLeadId() ?? undefined,
        accessTokenClaims: parseJwtClaims(tokens.accessToken?.accessToken),
      });
      const serverSession = await webApiClient.auth.getSession();

      if (
        !serverSession.session.isAuthenticated ||
        serverSession.session.user === null
      ) {
        throw new Error(
          'Unable to persist the secure server session after the Okta callback.',
        );
      }

      setSession(serverSession.session);
      oktaAuth.tokenManager.clear();
      oktaAuth.clearStorage();
      authRedirectInFlight = false;
      window.location.replace(originalUri);
    } catch (error) {
      authRedirectInFlight = false;
      const message =
        error instanceof Error ? error.message : 'Unable to complete sign-in.';
      setSession(toUnauthenticatedSession('okta', message));
    }
  }, [config, webApiClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      signIn,
      signOut,
      handleCallback,
      refreshSession,
    }),
    [handleCallback, refreshSession, session, signIn, signOut],
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

'use client';

import * as React from 'react';
import type {
  AuthAssuranceLevel,
  AuthSession,
  AuthUser,
  SignInRequest,
} from '@acme-los/auth/contracts';
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
  if (!rawValue) {
    return toUnauthenticatedSession('mock');
  }

  try {
    const parsedUser = JSON.parse(rawValue) as AuthUser;
    return toAuthenticatedSession(parsedUser, 'mock');
  } catch {
    window.sessionStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
    return toUnauthenticatedSession('mock');
  }
}

function persistMockUser(user: AuthUser) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(user));
}

function clearLocalSessionArtifacts() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
  window.sessionStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
}

function buildUserFromOktaClaims(
  claims: Record<string, unknown>,
): AuthUser | null {
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const firstName =
    typeof claims.given_name === 'string' ? claims.given_name : undefined;
  const lastName =
    typeof claims.family_name === 'string' ? claims.family_name : undefined;
  const leadId =
    (typeof claims.lead_id === 'string' && claims.lead_id) ||
    (typeof claims.leadId === 'string' && claims.leadId) ||
    getStoredLeadId() ||
    undefined;
  const customerId =
    (typeof claims.customer_id === 'string' && claims.customer_id) ||
    (typeof claims.customerId === 'string' && claims.customerId) ||
    undefined;
  const displayName =
    (typeof claims.name === 'string' && claims.name) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email ||
    'Customer';
  const id =
    (typeof claims.sub === 'string' && claims.sub) || email || 'okta-user';
  const authenticationMethods = Array.isArray(claims.amr)
    ? claims.amr.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    id,
    email,
    displayName,
    firstName,
    lastName,
    leadId,
    customerId,
    authenticationMethods,
  };
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const config = React.useMemo(() => getWebAuthConfig(), []);
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
      const oktaAuth = getOktaAuthClient(config.okta);
      const authState = await oktaAuth.authStateManager.updateAuthState();
      const claims =
        (authState?.idToken?.claims as Record<string, unknown> | undefined) ??
        ((await oktaAuth.getUser()) as Record<string, unknown> | undefined);

      if (!authState?.isAuthenticated || !claims) {
        setSession(toUnauthenticatedSession('okta'));
        return;
      }

      const user = buildUserFromOktaClaims(claims);
      if (!user) {
        setSession(toUnauthenticatedSession('okta'));
        return;
      }

      setSession(toAuthenticatedSession(user, 'okta'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load auth session.';
      setSession(toUnauthenticatedSession('okta', message));
    }
  }, [config]);

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

    const handleAuthStateChange = async () => {
      await refreshSession();
    };

    oktaAuth.authStateManager.subscribe(handleAuthStateChange);
    void oktaAuth.start();
    void refreshSession();

    return () => {
      oktaAuth.authStateManager.unsubscribe(handleAuthStateChange);
      oktaAuth.stop();
    };
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

    await oktaAuth.signOut({
      clearTokensBeforeRedirect: true,
      postLogoutRedirectUri: config.okta.postLogoutRedirectUri,
    });
  }, [config]);

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
      const originalUri = getSafeReturnTo(
        oktaAuth.getOriginalUri() ?? firstApplicationStepPath,
      );
      await oktaAuth.handleRedirect();
      authRedirectInFlight = false;
      await refreshSession();
      window.location.replace(originalUri);
    } catch (error) {
      authRedirectInFlight = false;
      const message =
        error instanceof Error ? error.message : 'Unable to complete sign-in.';
      setSession(toUnauthenticatedSession('okta', message));
    }
  }, [config, refreshSession]);

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

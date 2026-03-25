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

type AuthSessionResponse = {
  session: AuthSession;
};
type SyncAuthSessionRequest = {
  idToken: string;
  leadId?: string;
  accessTokenClaims?: Record<string, unknown> | null;
};

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

async function requestAuthSession(): Promise<AuthSessionResponse> {
  const response = await fetch('/api/auth/session', {
    credentials: 'same-origin',
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Unable to load auth session (${response.status}).`);
  }

  return (await response.json()) as AuthSessionResponse;
}

async function requestCsrfToken(): Promise<string> {
  const response = await fetch('/api/security/csrf', {
    credentials: 'same-origin',
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Unable to issue CSRF token (${response.status}).`);
  }

  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) {
    throw new Error('Unable to issue a CSRF token for this request.');
  }

  return body.csrfToken;
}

async function syncServerAuthSession(
  payload: SyncAuthSessionRequest,
): Promise<AuthSessionResponse> {
  const csrfToken = await requestCsrfToken();
  const response = await fetch('/api/auth/session', {
    body: JSON.stringify(payload),
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    method: 'POST',
  });

  if (!response.ok) {
    let errorMessage = `Unable to sync auth session (${response.status}).`;

    try {
      const body = (await response.json()) as {
        session?: { errorMessage?: string };
      };

      if (body.session?.errorMessage) {
        errorMessage = body.session.errorMessage;
      }
    } catch {
      // Keep the generic transport error when the API response cannot be parsed.
    }

    throw new Error(errorMessage);
  }

  return (await response.json()) as AuthSessionResponse;
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
  const [session, setSession] = React.useState<AuthSession>({
    ...EMPTY_AUTH_SESSION,
    provider: config.provider,
  });

  const migrateBrowserTokensToServerSession = React.useCallback(async () => {
    if (config.provider !== 'okta' || !config.okta) {
      return false;
    }

    const oktaAuth = getOktaAuthClient(config.okta);
    const tokens = await oktaAuth.tokenManager.getTokens();

    if (!tokens.idToken?.idToken) {
      return false;
    }

    await syncServerAuthSession({
      idToken: tokens.idToken.idToken,
      leadId: getStoredLeadId() ?? undefined,
      accessTokenClaims: parseJwtClaims(tokens.accessToken?.accessToken),
    });
    oktaAuth.tokenManager.clear();
    oktaAuth.clearStorage();

    return true;
  }, [config]);

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
      const serverSession = await requestAuthSession();

      if (serverSession.session.isAuthenticated) {
        setSession(serverSession.session);
        return;
      }

      const migrated = await migrateBrowserTokensToServerSession();
      if (migrated) {
        const migratedSession = await requestAuthSession();
        setSession(migratedSession.session);
        return;
      }

      setSession(toUnauthenticatedSession('okta'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load auth session.';
      setSession(toUnauthenticatedSession('okta', message));
    }
  }, [config, migrateBrowserTokensToServerSession]);

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
    window.location.assign('/api/auth/logout');
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
      await oktaAuth.storeTokensFromRedirect();
      const originalUri = getSafeReturnTo(
        oktaAuth.getOriginalUri() ?? firstApplicationStepPath,
      );
      oktaAuth.removeOriginalUri();
      const tokens = await oktaAuth.tokenManager.getTokens();

      if (!tokens.idToken?.idToken) {
        throw new Error('Unable to capture the Okta id token after callback.');
      }

      await syncServerAuthSession({
        idToken: tokens.idToken.idToken,
        leadId: getStoredLeadId() ?? undefined,
        accessTokenClaims: parseJwtClaims(tokens.accessToken?.accessToken),
      });
      const serverSession = await requestAuthSession();

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

import type { WebAuthSession } from '@acme-los/api/contracts';
import { buildSignInRedirectPath } from './auth-routing';
import {
  isAssuranceSatisfied,
  MOCK_AUTH_STORAGE_KEY,
  type WebAuthRequirement,
} from './assurance';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerWebAuthConfig } from './config';
import { AUTH_SESSION_COOKIE_NAME } from './cookies';
import { readSessionCookiePayload } from './auth-session';
import { readStoredWebAuthSession } from './session-store';
import { getAssuranceLevelFromAuthenticationMethods } from './assurance';

function readMockServerSession(cookieValue?: string): WebAuthSession | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const user = JSON.parse(
      decodeURIComponent(cookieValue),
    ) as WebAuthSession['user'];
    if (!user) {
      return null;
    }

    return {
      provider: 'mock',
      status: 'authenticated',
      isAuthenticated: true,
      assuranceLevel: getAssuranceLevelFromAuthenticationMethods(
        user.authenticationMethods,
      ),
      user,
    };
  } catch {
    return null;
  }
}

export async function getServerWebAuthSession(): Promise<WebAuthSession | null> {
  const cookieStore = await cookies();
  const authConfig = getServerWebAuthConfig();

  if (authConfig.provider === 'mock') {
    return readMockServerSession(cookieStore.get(MOCK_AUTH_STORAGE_KEY)?.value);
  }

  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const sessionCookiePayload = readSessionCookiePayload(sessionCookie);
  const storedSession = sessionCookiePayload
    ? await readStoredWebAuthSession(sessionCookiePayload.sessionId)
    : null;

  return storedSession?.session ?? null;
}

export async function requireServerWebAuthSession(options: {
  returnTo: string;
  requirement?: WebAuthRequirement;
}): Promise<WebAuthSession> {
  const requirement = options.requirement ?? {
    requiresAuthentication: true,
    minimumAssuranceLevel: 'aal1',
  };
  const session = await getServerWebAuthSession();

  if (!requirement.requiresAuthentication) {
    return (
      session ?? {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      }
    );
  }

  if (!session?.isAuthenticated || session.user === null) {
    redirect(
      buildSignInRedirectPath({
        returnTo: options.returnTo,
        minimumAssuranceLevel: requirement.minimumAssuranceLevel ?? 'aal1',
      }),
    );
  }

  if (
    requirement.minimumAssuranceLevel &&
    !isAssuranceSatisfied(
      session.assuranceLevel,
      requirement.minimumAssuranceLevel,
    )
  ) {
    redirect(
      buildSignInRedirectPath({
        returnTo: options.returnTo,
        minimumAssuranceLevel: requirement.minimumAssuranceLevel,
      }),
    );
  }

  return session;
}

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
import {
  consumeStoredWebAuthStepUp,
  isStoredWebAuthStepUpFresh,
  readStoredWebAuthSession,
  type StoredWebAuthSession,
} from './session-store';
import { getAssuranceLevelFromAuthenticationMethods } from './assurance';

type ResolvedServerWebAuthSession = {
  session: WebAuthSession;
  storedSession?: StoredWebAuthSession;
};

export type ServerWebAuthSessionRequirementStatus = {
  session: WebAuthSession | null;
  isSatisfied: boolean;
};

const defaultAuthenticatedRequirement: WebAuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal1',
};

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

async function getResolvedServerWebAuthSession(): Promise<ResolvedServerWebAuthSession | null> {
  const cookieStore = await cookies();
  const authConfig = getServerWebAuthConfig();

  if (authConfig.provider === 'mock') {
    const session = readMockServerSession(
      cookieStore.get(MOCK_AUTH_STORAGE_KEY)?.value,
    );

    return session ? { session } : null;
  }

  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const sessionCookiePayload = readSessionCookiePayload(sessionCookie);
  const storedSession = sessionCookiePayload
    ? await readStoredWebAuthSession(sessionCookiePayload.sessionId)
    : null;

  return storedSession
    ? { session: storedSession.session, storedSession }
    : null;
}

export async function getServerWebAuthSession(): Promise<WebAuthSession | null> {
  return (await getResolvedServerWebAuthSession())?.session ?? null;
}

function hasFreshRequiredStepUp(
  resolvedSession: ResolvedServerWebAuthSession | null,
  requirement: WebAuthRequirement,
): boolean {
  if (!requirement.requiredStepUp) {
    return true;
  }

  if (resolvedSession?.session.provider === 'mock') {
    return true;
  }

  return Boolean(
    resolvedSession?.storedSession &&
    isStoredWebAuthStepUpFresh(
      resolvedSession.storedSession,
      requirement.requiredStepUp,
    ),
  );
}

function isResolvedServerWebAuthSessionRequirementSatisfied(
  resolvedSession: ResolvedServerWebAuthSession | null,
  requirement: WebAuthRequirement,
): boolean {
  if (!requirement.requiresAuthentication) {
    return true;
  }

  const session = resolvedSession?.session;
  if (!session?.isAuthenticated || session.user === null) {
    return false;
  }

  const minimumAssuranceLevel = requirement.minimumAssuranceLevel ?? 'aal1';
  if (!isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel)) {
    return false;
  }

  return hasFreshRequiredStepUp(resolvedSession, requirement);
}

export async function getServerWebAuthSessionRequirementStatus(
  requirement: WebAuthRequirement = defaultAuthenticatedRequirement,
): Promise<ServerWebAuthSessionRequirementStatus> {
  const resolvedSession = await getResolvedServerWebAuthSession();

  return {
    session: resolvedSession?.session ?? null,
    isSatisfied: isResolvedServerWebAuthSessionRequirementSatisfied(
      resolvedSession,
      requirement,
    ),
  };
}

export async function requireServerWebAuthSession(options: {
  returnTo: string;
  requirement?: WebAuthRequirement;
}): Promise<WebAuthSession> {
  const requirement = options.requirement ?? defaultAuthenticatedRequirement;
  const resolvedSession = await getResolvedServerWebAuthSession();
  const session = resolvedSession?.session ?? null;

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

  if (
    requirement.requiredStepUp &&
    !hasFreshRequiredStepUp(resolvedSession, requirement)
  ) {
    redirect(
      buildSignInRedirectPath({
        returnTo: options.returnTo,
        minimumAssuranceLevel: requirement.minimumAssuranceLevel ?? 'aal2',
      }),
    );
  }

  if (
    requirement.requiredStepUp?.consumeOnSatisfied &&
    resolvedSession?.storedSession
  ) {
    await consumeStoredWebAuthStepUp(
      resolvedSession.storedSession,
      requirement.requiredStepUp,
    );
  }

  return session;
}

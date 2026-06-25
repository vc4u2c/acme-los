import type { WebAuthSession } from '@acme-los/api/contracts';
import { buildSignInRedirectPath } from './auth-routing';
import {
  isAssuranceSatisfied,
  MOCK_AUTH_STORAGE_KEY,
  type WebAuthRequirement,
} from './assurance';
import {
  readBffWebAuthSession,
  requireBffWebAuthSession,
} from './bff-auth-session-client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerWebAuthConfig } from './config';
import { getAssuranceLevelFromAuthenticationMethods } from './assurance';

type ResolvedServerWebAuthSession = {
  session: WebAuthSession;
};

export type ServerWebAuthSessionRequirementStatus = {
  session: WebAuthSession | null;
  isSatisfied: boolean;
};

const defaultAuthenticatedRequirement: WebAuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal1',
};

function buildCookieHeader(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function toBffRequirement(requirement: WebAuthRequirement) {
  return {
    requiresAuthentication: requirement.requiresAuthentication,
    minimumAssuranceLevel: requirement.minimumAssuranceLevel,
    requiredStepUp: requirement.requiredStepUp,
  };
}

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

  const sessionResponse = await readBffWebAuthSession({
    cookieHeader: buildCookieHeader(cookieStore),
  });

  return sessionResponse.session.isAuthenticated
    ? { session: sessionResponse.session }
    : null;
}

export async function getServerWebAuthSession(): Promise<WebAuthSession | null> {
  return (await getResolvedServerWebAuthSession())?.session ?? null;
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
  return isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel);
}

export async function getServerWebAuthSessionRequirementStatus(
  requirement: WebAuthRequirement = defaultAuthenticatedRequirement,
): Promise<ServerWebAuthSessionRequirementStatus> {
  if (getServerWebAuthConfig().provider !== 'mock') {
    const cookieStore = await cookies();
    const requirementResponse = await requireBffWebAuthSession(
      {
        cookieHeader: buildCookieHeader(cookieStore),
      },
      toBffRequirement(requirement),
    );

    return {
      session: requirementResponse.session.isAuthenticated
        ? requirementResponse.session
        : null,
      isSatisfied: requirementResponse.satisfied,
    };
  }

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

  if (getServerWebAuthConfig().provider !== 'mock') {
    const cookieStore = await cookies();
    const requirementResponse = await requireBffWebAuthSession(
      {
        cookieHeader: buildCookieHeader(cookieStore),
      },
      toBffRequirement(requirement),
    );

    if (!requirement.requiresAuthentication) {
      return requirementResponse.session;
    }

    if (!requirementResponse.satisfied) {
      redirect(
        buildSignInRedirectPath({
          returnTo: options.returnTo,
          minimumAssuranceLevel: requirement.requiredStepUp
            ? (requirement.minimumAssuranceLevel ?? 'aal2')
            : (requirement.minimumAssuranceLevel ?? 'aal1'),
        }),
      );
    }

    return requirementResponse.session;
  }

  const resolvedSession = await getResolvedServerWebAuthSession();
  const session = resolvedSession?.session ?? null;

  if (!requirement.requiresAuthentication) {
    return (
      session ?? {
        provider: 'mock',
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

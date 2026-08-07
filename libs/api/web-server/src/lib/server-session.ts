import type { WebAuthSession } from '@acme-los/api/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildSignInRedirectPath } from './auth-routing';
import type { WebAuthRequirement } from './assurance';
import {
  readBffWebAuthSession,
  requireBffWebAuthSession,
} from './bff-auth-session-client';

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

export async function getServerWebAuthSession(): Promise<WebAuthSession | null> {
  const cookieStore = await cookies();
  const sessionResponse = await readBffWebAuthSession({
    cookieHeader: buildCookieHeader(cookieStore),
  });

  return sessionResponse.session.isAuthenticated
    ? sessionResponse.session
    : null;
}

export async function getServerWebAuthSessionRequirementStatus(
  requirement: WebAuthRequirement = defaultAuthenticatedRequirement,
): Promise<ServerWebAuthSessionRequirementStatus> {
  const cookieStore = await cookies();
  const requirementResponse = await requireBffWebAuthSession(
    { cookieHeader: buildCookieHeader(cookieStore) },
    toBffRequirement(requirement),
  );

  return {
    session: requirementResponse.session.isAuthenticated
      ? requirementResponse.session
      : null,
    isSatisfied: requirementResponse.satisfied,
  };
}

export async function requireServerWebAuthSession(options: {
  returnTo: string;
  requirement?: WebAuthRequirement;
}): Promise<WebAuthSession> {
  const requirement = options.requirement ?? defaultAuthenticatedRequirement;
  const cookieStore = await cookies();
  const requirementResponse = await requireBffWebAuthSession(
    { cookieHeader: buildCookieHeader(cookieStore) },
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

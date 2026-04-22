import type { AuthRequirement } from '@acme-los/auth/contracts';
import type { ApplicationStepSlug } from '../components/web/apply/step-definitions';

export const FUNDING_STEP_UP_MAX_AGE_SECONDS = 10 * 60;

const standardApplicationRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal1',
};

const fundingRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'funding',
    maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
  },
};

export function getApplicationAuthRequirement(
  step: ApplicationStepSlug,
): AuthRequirement {
  if (step === 'funding') {
    return fundingRequirement;
  }

  return standardApplicationRequirement;
}

export function getApplicationAuthRequirementForPath(
  path: string | undefined,
): AuthRequirement | null {
  if (!path) {
    return null;
  }

  const pathname = path.split('?')[0];

  if (pathname === '/apply/funding') {
    return fundingRequirement;
  }

  return null;
}

export function getMinimumAssuranceLevelForApplicationPath(
  path: string | undefined,
  requestedAssuranceLevel: Exclude<
    AuthRequirement['minimumAssuranceLevel'],
    undefined
  > = 'aal1',
): Exclude<AuthRequirement['minimumAssuranceLevel'], undefined> {
  const routeRequirement = getApplicationAuthRequirementForPath(path);

  if (
    requestedAssuranceLevel === 'aal2' ||
    routeRequirement?.minimumAssuranceLevel === 'aal2'
  ) {
    return 'aal2';
  }

  return 'aal1';
}

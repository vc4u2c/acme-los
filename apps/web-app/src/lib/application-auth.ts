import type { AuthRequirement } from '@acme-los/auth/contracts';
import type { ApplicationStepSlug } from '../components/web/apply/step-definitions';

export const FUNDING_STEP_UP_MAX_AGE_SECONDS = 10 * 60;
export const ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS = 10 * 60;

const standardApplicationRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal1',
};

const fundingPageRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'funding',
    maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
    consumeOnSatisfied: true,
  },
};

const fundingApiRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'funding',
    maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
  },
};

const accountEmailPageRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'account-email',
    maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
  },
};

const accountPhonePageRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'account-phone',
    maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
  },
};

const accountPasswordPageRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'account-password',
    maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
  },
};

export function getApplicationAuthRequirement(
  step: ApplicationStepSlug,
): AuthRequirement {
  if (step === 'funding') {
    return fundingApiRequirement;
  }

  return standardApplicationRequirement;
}

export function getApplicationPageAuthRequirement(
  step: ApplicationStepSlug,
): AuthRequirement {
  if (step === 'funding') {
    return fundingPageRequirement;
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
    return fundingPageRequirement;
  }

  if (pathname === '/account/security/email') {
    return accountEmailPageRequirement;
  }

  if (pathname === '/account/security/phone') {
    return accountPhonePageRequirement;
  }

  if (pathname === '/account/security/password') {
    return accountPasswordPageRequirement;
  }

  return null;
}

export function getSignInAuthRequirementForPath(
  path: string | undefined,
  minimumAssuranceLevel: Exclude<
    AuthRequirement['minimumAssuranceLevel'],
    undefined
  >,
): AuthRequirement {
  const routeRequirement = getApplicationAuthRequirementForPath(path);

  return routeRequirement?.requiredStepUp
    ? {
        requiresAuthentication: true,
        minimumAssuranceLevel,
        requiredStepUp: {
          ...routeRequirement.requiredStepUp,
          consumeOnSatisfied: false,
        },
      }
    : {
        requiresAuthentication: true,
        minimumAssuranceLevel,
      };
}

export function shouldAlwaysStartInteractiveStepUpForPath(
  path: string | undefined,
): boolean {
  return (
    getApplicationAuthRequirementForPath(path)?.requiredStepUp
      ?.consumeOnSatisfied === true
  );
}

export function getAccountSecurityAuthRequirement(
  action: 'email' | 'phone' | 'password',
): AuthRequirement {
  if (action === 'email') {
    return accountEmailPageRequirement;
  }

  if (action === 'phone') {
    return accountPhonePageRequirement;
  }

  return accountPasswordPageRequirement;
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

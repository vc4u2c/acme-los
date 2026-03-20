import type { AuthRequirement } from '@acme-los/auth/contracts';
import type { ApplicationStepSlug } from '../components/web/apply/step-definitions';

const standardApplicationRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal1',
};

const fundingRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
};

export function getApplicationAuthRequirement(
  step: ApplicationStepSlug,
): AuthRequirement {
  if (step === 'funding') {
    return fundingRequirement;
  }

  return standardApplicationRequirement;
}

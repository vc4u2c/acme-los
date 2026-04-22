import { getSafeAuthReturnTo } from '@acme-los/auth/core';
import { getServerWebAuthSessionRequirementStatus } from '@acme-los/api/web-server';
import { redirect } from 'next/navigation';
import { CustomerAuthLaunchPage } from '../../../components/web/customer-auth-launch-page';
import {
  getApplicationAuthRequirementForPath,
  getMinimumAssuranceLevelForApplicationPath,
} from '../../../lib/application-auth';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    aal?: string;
    authError?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeAuthReturnTo(
    resolvedSearchParams.returnTo,
    '/account/profile',
  );
  const routeRequirement = getApplicationAuthRequirementForPath(returnTo);
  const minimumAssuranceLevel = getMinimumAssuranceLevelForApplicationPath(
    returnTo,
    resolvedSearchParams.aal === 'aal2' ? 'aal2' : 'aal1',
  );
  const signInRequirement = routeRequirement?.requiredStepUp
    ? {
        requiresAuthentication: true,
        minimumAssuranceLevel,
        requiredStepUp: routeRequirement.requiredStepUp,
      }
    : {
        requiresAuthentication: true,
        minimumAssuranceLevel,
      };
  const authError = resolvedSearchParams.authError?.trim() || undefined;
  const { session, isSatisfied } =
    await getServerWebAuthSessionRequirementStatus(signInRequirement);

  if (session?.isAuthenticated && session.user !== null && isSatisfied) {
    redirect(returnTo);
  }

  return (
    <CustomerAuthLaunchPage
      returnTo={returnTo}
      minimumAssuranceLevel={minimumAssuranceLevel}
      eyebrow="Customer portal"
      title="Opening secure sign in"
      description="Use the hosted Okta customer portal to resume the application, review disclosures, and check funding updates in one secure place."
      actionLabel="Continue to secure sign in"
      launchingLabel="Redirecting to secure sign in..."
      errorMessage={authError}
    />
  );
}

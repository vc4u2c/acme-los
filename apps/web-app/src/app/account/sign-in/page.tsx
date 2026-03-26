import { isAssuranceSatisfied } from '@acme-los/auth/core';
import { getServerWebAuthSession } from '@acme-los/api/web-server';
import { redirect } from 'next/navigation';
import { CustomerAuthLaunchPage } from '../../../components/web/customer-auth-launch-page';

function getSafeReturnTo(returnTo?: string): string {
  if (!returnTo || !returnTo.startsWith('/')) {
    return '/account/profile';
  }

  return returnTo;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; aal?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeReturnTo(resolvedSearchParams.returnTo);
  const minimumAssuranceLevel =
    resolvedSearchParams.aal === 'aal2' ? 'aal2' : 'aal1';
  const session = await getServerWebAuthSession();

  if (
    session?.isAuthenticated &&
    session.user !== null &&
    isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel)
  ) {
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
    />
  );
}

import { getSafeAuthReturnTo } from '@acme-los/auth/core';
import {
  getServerWebAuthSessionRequirementStatus,
  parsePostChangeAuthIntent,
  POST_CHANGE_AUTH_COOKIE_NAME,
} from '@acme-los/api/web-server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CustomerIdxAuthPage } from '../../../components/web/customer-idx-auth-page';
import {
  getMinimumAssuranceLevelForApplicationPath,
  getSignInAuthRequirementForPath,
  shouldAlwaysStartInteractiveStepUpForPath,
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
  const minimumAssuranceLevel = getMinimumAssuranceLevelForApplicationPath(
    returnTo,
    resolvedSearchParams.aal === 'aal2' ? 'aal2' : 'aal1',
  );
  const signInRequirement = getSignInAuthRequirementForPath(
    returnTo,
    minimumAssuranceLevel,
  );
  const shouldAlwaysStartInteractiveStepUp =
    shouldAlwaysStartInteractiveStepUpForPath(returnTo);
  const authError = resolvedSearchParams.authError?.trim() || undefined;
  const cookieStore = await cookies();
  const postChange = Boolean(
    parsePostChangeAuthIntent(
      cookieStore.get(POST_CHANGE_AUTH_COOKIE_NAME)?.value,
    ),
  );
  const { session, isSatisfied } =
    await getServerWebAuthSessionRequirementStatus(signInRequirement);

  if (
    session?.isAuthenticated &&
    session.user !== null &&
    isSatisfied &&
    !shouldAlwaysStartInteractiveStepUp &&
    !postChange
  ) {
    redirect(returnTo);
  }

  return (
    <CustomerIdxAuthPage
      returnTo={returnTo}
      minimumAssuranceLevel={minimumAssuranceLevel}
      flow="authenticate"
      errorMessage={authError}
      postChange={postChange}
    />
  );
}

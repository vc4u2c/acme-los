import { getSafeAuthReturnTo } from '@acme-los/auth/core';
import {
  getServerWebAuthConfig,
  getServerWebAuthSessionRequirementStatus,
  parsePostChangeAuthIntent,
  POST_CHANGE_AUTH_COOKIE_NAME,
} from '@acme-los/api/web-server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CustomerIdxAuthPage } from '../../../components/web/customer-idx-auth-page';
import { CustomerMockSignInPage } from '../../../components/web/customer-mock-sign-in-page';
import type { IdxJourneyFlow } from '../../../lib/idx-experience';
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
    flow?: string;
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
  const requestedIdxFlow: IdxJourneyFlow = [
    'register',
    'recoverPassword',
    'unlockAccount',
  ].includes(resolvedSearchParams.flow ?? '')
    ? (resolvedSearchParams.flow as IdxJourneyFlow)
    : 'authenticate';
  const idxFlow: IdxJourneyFlow = postChange
    ? 'authenticate'
    : requestedIdxFlow;
  const { session, isSatisfied } =
    await getServerWebAuthSessionRequirementStatus(signInRequirement);

  if (
    idxFlow === 'authenticate' &&
    session?.isAuthenticated &&
    session.user !== null &&
    isSatisfied &&
    !shouldAlwaysStartInteractiveStepUp &&
    !postChange
  ) {
    redirect(returnTo);
  }

  if (getServerWebAuthConfig().provider !== 'mock') {
    return (
      <CustomerIdxAuthPage
        returnTo={returnTo}
        minimumAssuranceLevel={minimumAssuranceLevel}
        flow={idxFlow}
        errorMessage={authError}
        postChange={postChange}
      />
    );
  }

  return (
    <CustomerMockSignInPage
      returnTo={returnTo}
      minimumAssuranceLevel={minimumAssuranceLevel}
      errorMessage={authError}
    />
  );
}

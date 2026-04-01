import type { WebAuthSessionAssuranceLevel } from '@acme-los/api/contracts';

const FIRST_APPLICATION_STEP_PATH = '/apply/personal-info';

function normalizeAuthReturnTo(returnTo: string): string {
  if (returnTo === '/apply') {
    return FIRST_APPLICATION_STEP_PATH;
  }

  if (returnTo.startsWith('/apply?')) {
    return `${FIRST_APPLICATION_STEP_PATH}${returnTo.slice('/apply'.length)}`;
  }

  return returnTo;
}

export function getSafeServerAuthReturnTo(
  returnTo?: string,
  fallback = FIRST_APPLICATION_STEP_PATH,
): string {
  if (!returnTo || !returnTo.startsWith('/')) {
    return fallback;
  }

  return normalizeAuthReturnTo(returnTo);
}

export function buildSignInRedirectPath({
  returnTo,
  minimumAssuranceLevel = 'aal1',
  authError,
}: {
  returnTo: string;
  minimumAssuranceLevel?: Exclude<WebAuthSessionAssuranceLevel, 'anonymous'>;
  authError?: string;
}): string {
  const searchParams = new URLSearchParams({
    returnTo: getSafeServerAuthReturnTo(returnTo),
  });

  if (minimumAssuranceLevel === 'aal2') {
    searchParams.set('aal', 'aal2');
  }

  const normalizedError = authError?.trim();
  if (normalizedError) {
    searchParams.set('authError', normalizedError);
  }

  return `/account/sign-in?${searchParams.toString()}`;
}

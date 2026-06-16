export const FIRST_APPLICATION_STEP_PATH = '/apply/personal-info';

export function normalizeAuthReturnTo(returnTo: string): string {
  if (returnTo === '/apply') {
    return FIRST_APPLICATION_STEP_PATH;
  }

  if (returnTo.startsWith('/apply?')) {
    return `${FIRST_APPLICATION_STEP_PATH}${returnTo.slice('/apply'.length)}`;
  }

  return returnTo;
}

export function getSafeAuthReturnTo(
  returnTo?: string,
  fallback = FIRST_APPLICATION_STEP_PATH,
): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return fallback;
  }

  return normalizeAuthReturnTo(returnTo);
}

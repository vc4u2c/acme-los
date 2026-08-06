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

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const characterCode = character.charCodeAt(0);
    return characterCode <= 0x1f || characterCode === 0x7f;
  });
}

export function getSafeAuthReturnTo(
  returnTo?: string,
  fallback = FIRST_APPLICATION_STEP_PATH,
): string {
  if (
    !returnTo ||
    !returnTo.startsWith('/') ||
    returnTo.includes('\\') ||
    hasControlCharacter(returnTo)
  ) {
    return fallback;
  }

  try {
    const expectedOrigin = new URL('https://acme-los.invalid');
    const resolvedReturnTo = new URL(returnTo, expectedOrigin);

    if (resolvedReturnTo.origin !== expectedOrigin.origin) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return normalizeAuthReturnTo(returnTo);
}

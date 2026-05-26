export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'acme-los-theme';
export const THEME_COOKIE_NAME = 'acme_theme';
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type ThemeEnvironment = {
  [name: string]: string | undefined;
  NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN?: string;
};

export function parseThemeMode(
  value: string | null | undefined,
): ThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function readThemeCookie(cookieHeader: string): ThemeMode | null {
  for (const rawEntry of cookieHeader.split(';')) {
    const separator = rawEntry.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const name = rawEntry.slice(0, separator).trim();
    if (name !== THEME_COOKIE_NAME) {
      continue;
    }

    try {
      return parseThemeMode(
        decodeURIComponent(rawEntry.slice(separator + 1).trim()),
      );
    } catch {
      return null;
    }
  }

  return null;
}

export function resolveThemeCookieDomain(
  source: ThemeEnvironment = process.env,
): string {
  const value = source.NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN?.trim()
    .replace(/^\./, '')
    .toLowerCase();

  if (
    !value ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      value,
    )
  ) {
    return '';
  }

  return value;
}

export function canWriteSharedThemeCookie(
  hostname: string,
  cookieDomain: string,
): boolean {
  const normalizedHost = hostname.toLowerCase();
  return (
    cookieDomain.length > 0 &&
    (normalizedHost === cookieDomain ||
      normalizedHost.endsWith(`.${cookieDomain}`))
  );
}

export function createThemeCookie(
  theme: ThemeMode,
  options: {
    hostname: string;
    secure: boolean;
    cookieDomain: string;
  },
): string {
  const attributes = [
    `${THEME_COOKIE_NAME}=${theme}`,
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    'Path=/',
    'SameSite=Lax',
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  if (canWriteSharedThemeCookie(options.hostname, options.cookieDomain)) {
    attributes.push(`Domain=${options.cookieDomain}`);
  }

  return attributes.join('; ');
}

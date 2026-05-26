import {
  canWriteSharedThemeCookie,
  createThemeCookie,
  readThemeCookie,
  resolveThemeCookieDomain,
} from '../src/lib/theme-preference';

describe('theme preference cookie', () => {
  it('reads only supported theme values', () => {
    expect(readThemeCookie('session=opaque; acme_theme=dark')).toBe('dark');
    expect(readThemeCookie('acme_theme=contrast')).toBeNull();
    expect(readThemeCookie('acme_theme=%E0%A4%A')).toBeNull();
  });

  it('shares the display preference across branded subdomains only', () => {
    expect(
      canWriteSharedThemeCookie('apply-dev.avanai.net', 'avanai.net'),
    ).toBe(true);
    expect(canWriteSharedThemeCookie('auth.avanai.net', 'avanai.net')).toBe(
      true,
    );
    expect(
      canWriteSharedThemeCookie('example.azurecontainerapps.io', 'avanai.net'),
    ).toBe(false);
  });

  it('creates a secure parent-domain cookie only from a matching host', () => {
    expect(
      createThemeCookie('dark', {
        hostname: 'apply-dev.avanai.net',
        secure: true,
        cookieDomain: 'avanai.net',
      }),
    ).toContain('Domain=avanai.net');

    expect(
      createThemeCookie('dark', {
        hostname: 'localhost',
        secure: false,
        cookieDomain: 'avanai.net',
      }),
    ).not.toContain('Domain=');
  });

  it('rejects unsafe or unrelated configured domains', () => {
    expect(
      resolveThemeCookieDomain({
        NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN: '.avanai.net',
      }),
    ).toBe('avanai.net');
    expect(
      resolveThemeCookieDomain({
        NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN: 'avanai.net; Secure',
      }),
    ).toBe('');
  });
});

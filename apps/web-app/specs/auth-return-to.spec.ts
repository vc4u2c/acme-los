import { getSafeAuthReturnTo } from '@acme-los/auth/core';
import { buildSignInRedirectPath } from '@acme-los/api/web-server';

describe('auth return paths', () => {
  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    '/safe\npath',
  ])('rejects unsafe browser return path %s', (returnTo) => {
    expect(getSafeAuthReturnTo(returnTo)).toBe('/apply/personal-info');
    expect(buildSignInRedirectPath({ returnTo })).toBe(
      '/account/sign-in?returnTo=%2Fapply%2Fpersonal-info',
    );
  });

  it('keeps an internal path and normalizes the application root', () => {
    expect(getSafeAuthReturnTo('/account/profile?tab=security')).toBe(
      '/account/profile?tab=security',
    );
    expect(getSafeAuthReturnTo('/apply?resume=true')).toBe(
      '/apply/personal-info?resume=true',
    );
  });
});

import {
  buildAccountSecurityActionUrl,
  buildAccountSecurityStepUpUrl,
  buildPasswordRecoveryUrl,
} from '../src/lib/okta-account-actions';

describe('Okta account action links', () => {
  it('keeps password, email, and phone actions on ACME account-security routes', () => {
    expect(buildAccountSecurityActionUrl('password')).toBe(
      '/account/security/password',
    );
    expect(buildAccountSecurityActionUrl('change-email')).toBe(
      '/account/security/email',
    );
    expect(buildAccountSecurityActionUrl('change-phone')).toBe(
      '/account/security/phone',
    );
  });

  it('starts dashboard account actions through the exact protected step-up route', () => {
    expect(buildAccountSecurityStepUpUrl('password')).toBe(
      '/account/sign-in?returnTo=%2Faccount%2Fsecurity%2Fpassword&aal=aal2',
    );
    expect(buildAccountSecurityStepUpUrl('change-email')).toBe(
      '/account/sign-in?returnTo=%2Faccount%2Fsecurity%2Femail&aal=aal2',
    );
    expect(buildAccountSecurityStepUpUrl('change-phone')).toBe(
      '/account/sign-in?returnTo=%2Faccount%2Fsecurity%2Fphone&aal=aal2',
    );
  });

  it('builds the app-owned IDX password recovery path', () => {
    expect(buildPasswordRecoveryUrl()).toBe(
      '/account/sign-in?returnTo=%2Faccount%2Fprofile%3Faccount_action%3Dpassword&flow=recoverPassword',
    );
    expect(buildPasswordRecoveryUrl('/account/security/password')).toBe(
      '/account/sign-in?returnTo=%2Faccount%2Fsecurity%2Fpassword&flow=recoverPassword',
    );
  });
});

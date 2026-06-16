import {
  buildAccountSecurityActionUrl,
  buildAccountSecurityStepUpUrl,
  buildHostedPasswordRecoveryUrl,
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
      '/api/auth/start?returnTo=%2Faccount%2Fsecurity%2Fpassword&aal=aal2',
    );
    expect(buildAccountSecurityStepUpUrl('change-email')).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fsecurity%2Femail&aal=aal2',
    );
    expect(buildAccountSecurityStepUpUrl('change-phone')).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fsecurity%2Fphone&aal=aal2',
    );
  });

  it('builds the hosted widget password recovery path', () => {
    expect(buildHostedPasswordRecoveryUrl()).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fprofile%3Faccount_action%3Dpassword&widgetFlow=resetPassword',
    );
    expect(buildHostedPasswordRecoveryUrl('/account/security/password')).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fsecurity%2Fpassword&widgetFlow=resetPassword',
    );
  });
});

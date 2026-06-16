import {
  buildAccountSecurityActionUrl,
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

  it('builds the hosted widget password recovery path', () => {
    expect(buildHostedPasswordRecoveryUrl()).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fprofile%3Faccount_action%3Dpassword&widgetFlow=resetPassword',
    );
    expect(buildHostedPasswordRecoveryUrl('/account/security/password')).toBe(
      '/api/auth/start?returnTo=%2Faccount%2Fsecurity%2Fpassword&widgetFlow=resetPassword',
    );
  });
});

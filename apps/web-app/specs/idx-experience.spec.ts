import {
  filterAuthenticatorOptions,
  getIdxJourneyContent,
  isRememberPreferenceInput,
  selectInitialIdxStep,
  shouldAutoAdvanceInitialIdxStep,
} from '../src/lib/idx-experience';

const authenticatorOptions = [
  { label: 'Password', value: 'okta_password' },
  { label: 'Email', value: 'okta_email' },
  { label: 'Phone', value: 'phone_number' },
  { label: 'Security Question', value: 'security_question' },
];

describe('IDX experience rules', () => {
  it('offers email or SMS for funding and excludes password', () => {
    expect(
      filterAuthenticatorOptions(authenticatorOptions, 'funding').map(
        (option) => option.value,
      ),
    ).toEqual(['okta_email', 'phone_number']);
    expect(getIdxJourneyContent('authenticate', 'funding').description).toBe(
      'Choose email or text message for this funding check. Your password is not required.',
    );
  });

  it('sequences password before the opposite possession factor for account changes', () => {
    expect(
      filterAuthenticatorOptions(authenticatorOptions, 'account-email').map(
        (option) => option.value,
      ),
    ).toEqual(['okta_password']);
    expect(
      filterAuthenticatorOptions(
        authenticatorOptions,
        'account-email',
        true,
      ).map((option) => option.value),
    ).toEqual(['phone_number']);
    expect(
      filterAuthenticatorOptions(authenticatorOptions, 'account-phone').map(
        (option) => option.value,
      ),
    ).toEqual(['okta_password']);
    expect(
      filterAuthenticatorOptions(
        authenticatorOptions,
        'account-phone',
        true,
      ).map((option) => option.value),
    ).toEqual(['okta_email']);
  });

  it('requires the newly changed factor during the fresh sign-in', () => {
    expect(
      filterAuthenticatorOptions(
        authenticatorOptions,
        'post-email-change',
        true,
      ).map((option) => option.value),
    ).toEqual(['okta_email']);
    expect(
      filterAuthenticatorOptions(
        authenticatorOptions,
        'post-phone-change',
        true,
      ).map((option) => option.value),
    ).toEqual(['phone_number']);
  });

  it('does not filter normal sign-in or registration choices', () => {
    expect(filterAuthenticatorOptions(authenticatorOptions, null)).toEqual(
      authenticatorOptions,
    );
  });

  it('hides only optional remember-session preferences', () => {
    expect(isRememberPreferenceInput('keepMeSignedIn')).toBe(true);
    expect(isRememberPreferenceInput('rememberDevice')).toBe(true);
    expect(isRememberPreferenceInput('rememberMe')).toBe(true);
    expect(isRememberPreferenceInput('verificationCode')).toBe(false);
    expect(isRememberPreferenceInput('consent')).toBe(false);
  });

  it('selects the journey-specific initial remediation in Auth JS 8 step mode', () => {
    const availableSteps = [
      { name: 'identify' },
      { name: 'select-enroll-profile' },
      { name: 'currentAuthenticator-recover' },
      { name: 'unlock-account' },
    ];

    expect(selectInitialIdxStep(availableSteps, 'authenticate')?.name).toBe(
      'identify',
    );
    expect(selectInitialIdxStep(availableSteps, 'register')?.name).toBe(
      'select-enroll-profile',
    );
    expect(selectInitialIdxStep(availableSteps, 'recoverPassword')?.name).toBe(
      'currentAuthenticator-recover',
    );
    expect(selectInitialIdxStep(availableSteps, 'unlockAccount')?.name).toBe(
      'unlock-account',
    );
  });

  it('auto-advances only structural journey actions, never OTP challenges', () => {
    expect(
      shouldAutoAdvanceInitialIdxStep({ name: 'select-enroll-profile' }),
    ).toBe(true);
    expect(
      shouldAutoAdvanceInitialIdxStep({ name: 'currentAuthenticator-recover' }),
    ).toBe(true);
    expect(
      shouldAutoAdvanceInitialIdxStep({ name: 'challenge-authenticator' }),
    ).toBe(false);
  });
});

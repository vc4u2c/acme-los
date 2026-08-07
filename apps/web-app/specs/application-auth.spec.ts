import {
  ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
  FUNDING_STEP_UP_MAX_AGE_SECONDS,
  getAccountSecurityAuthRequirement,
  getApplicationAuthRequirement,
  getApplicationPageAuthRequirement,
  getApplicationAuthRequirementForPath,
  getMinimumAssuranceLevelForApplicationPath,
  getSignInAuthRequirementForPath,
  shouldAlwaysStartInteractiveStepUpForPath,
} from '../src/lib/application-auth';

describe('application auth requirements', () => {
  it('requires a fresh funding step-up for the funding route entry', () => {
    const expectedRequirement = {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'funding',
        maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
        consumeOnSatisfied: true,
      },
    };

    expect(getApplicationAuthRequirementForPath('/apply/funding')).toEqual(
      expectedRequirement,
    );
    expect(getApplicationPageAuthRequirement('funding')).toEqual(
      expectedRequirement,
    );
  });

  it('keeps funding API calls inside the fresh funding step-up window', () => {
    expect(getApplicationAuthRequirement('funding')).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'funding',
        maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
      },
    });
  });

  it('does not consume funding proof before the protected page loads', () => {
    expect(getSignInAuthRequirementForPath('/apply/funding', 'aal2')).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'funding',
        maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
        consumeOnSatisfied: false,
      },
    });
  });

  it('starts a new interactive funding proof after each consumed route entry', () => {
    expect(shouldAlwaysStartInteractiveStepUpForPath('/apply/funding')).toBe(
      true,
    );
    expect(
      shouldAlwaysStartInteractiveStepUpForPath('/account/security/email'),
    ).toBe(false);
    expect(
      shouldAlwaysStartInteractiveStepUpForPath('/apply/personal-info'),
    ).toBe(false);
  });

  it('promotes funding sign-in starts to aal2 even when aal1 is requested', () => {
    expect(
      getMinimumAssuranceLevelForApplicationPath('/apply/funding', 'aal1'),
    ).toBe('aal2');
  });

  it('requires opposite-channel step-up for account security routes', () => {
    expect(
      getApplicationAuthRequirementForPath('/account/security/email'),
    ).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'account-email',
        maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
      },
    });
    expect(
      getApplicationAuthRequirementForPath('/account/security/phone'),
    ).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'account-phone',
        maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
      },
    });
    expect(
      getApplicationAuthRequirementForPath('/account/security/password'),
    ).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'account-password',
        maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
      },
    });
    expect(getAccountSecurityAuthRequirement('email').requiredStepUp).toEqual({
      reason: 'account-email',
      maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
    });
    expect(
      getAccountSecurityAuthRequirement('password').requiredStepUp,
    ).toEqual({
      reason: 'account-password',
      maxAgeSeconds: ACCOUNT_SECURITY_STEP_UP_MAX_AGE_SECONDS,
    });
  });

  it('promotes account security starts to aal2 even when aal1 is requested', () => {
    expect(
      getMinimumAssuranceLevelForApplicationPath(
        '/account/security/email',
        'aal1',
      ),
    ).toBe('aal2');
    expect(
      getMinimumAssuranceLevelForApplicationPath(
        '/account/security/phone',
        'aal1',
      ),
    ).toBe('aal2');
    expect(
      getMinimumAssuranceLevelForApplicationPath(
        '/account/security/password',
        'aal1',
      ),
    ).toBe('aal2');
  });

  it('keeps non-funding sign-in starts at the requested assurance level', () => {
    expect(
      getMinimumAssuranceLevelForApplicationPath(
        '/apply/personal-info',
        'aal1',
      ),
    ).toBe('aal1');
    expect(
      getMinimumAssuranceLevelForApplicationPath(
        '/apply/personal-info',
        'aal2',
      ),
    ).toBe('aal2');
  });
});

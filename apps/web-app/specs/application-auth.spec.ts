import {
  FUNDING_STEP_UP_MAX_AGE_SECONDS,
  getApplicationAuthRequirementForPath,
  getMinimumAssuranceLevelForApplicationPath,
} from '../src/lib/application-auth';

describe('application auth requirements', () => {
  it('requires fresh funding step-up for the funding route', () => {
    expect(getApplicationAuthRequirementForPath('/apply/funding')).toEqual({
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal2',
      requiredStepUp: {
        reason: 'funding',
        maxAgeSeconds: FUNDING_STEP_UP_MAX_AGE_SECONDS,
      },
    });
  });

  it('promotes funding sign-in starts to aal2 even when aal1 is requested', () => {
    expect(
      getMinimumAssuranceLevelForApplicationPath('/apply/funding', 'aal1'),
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

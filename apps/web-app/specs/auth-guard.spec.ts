import { isRequiredStepUpFresh } from '@acme-los/auth/web';
import type { AuthRequirement, AuthSession } from '@acme-los/auth/contracts';

const fundingRequirement: AuthRequirement = {
  requiresAuthentication: true,
  minimumAssuranceLevel: 'aal2',
  requiredStepUp: {
    reason: 'funding',
    maxAgeSeconds: 600,
  },
};

const authenticatedAal2Session: AuthSession = {
  provider: 'okta',
  status: 'authenticated',
  isAuthenticated: true,
  assuranceLevel: 'aal2',
  user: {
    id: 'customer-1',
    displayName: 'Ada Customer',
  },
};

describe('auth guard step-up freshness', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires a fresh funding marker even when the session is already aal2', () => {
    expect(
      isRequiredStepUpFresh({
        requirement: fundingRequirement,
        session: authenticatedAal2Session,
        sessionTiming: null,
      }),
    ).toBe(false);
  });

  it('accepts an unexpired matching funding marker', () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    expect(
      isRequiredStepUpFresh({
        requirement: fundingRequirement,
        session: authenticatedAal2Session,
        sessionTiming: {
          absoluteExpiresAt: currentEpochSeconds + 3600,
          idleExpiresAt: currentEpochSeconds + 900,
          idleTimeoutSeconds: 900,
          warningSeconds: 120,
          stepUp: {
            reason: 'funding',
            completedAt: currentEpochSeconds,
            expiresAt: currentEpochSeconds + 600,
          },
        },
      }),
    ).toBe(true);
  });
});

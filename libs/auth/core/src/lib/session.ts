import type { AuthAssuranceLevel, AuthSession } from '@acme-los/auth/contracts';

export const EMPTY_AUTH_SESSION: AuthSession = {
  provider: 'okta',
  status: 'loading',
  isAuthenticated: false,
  assuranceLevel: 'anonymous',
  user: null,
};

export function getAssuranceLevelFromAuthenticationMethods(
  authenticationMethods?: string[],
): AuthAssuranceLevel {
  if (!authenticationMethods || authenticationMethods.length === 0) {
    return 'anonymous';
  }

  const normalizedMethods = authenticationMethods.map((method) =>
    method.toLowerCase(),
  );

  if (
    normalizedMethods.includes('mfa') ||
    normalizedMethods.includes('sms') ||
    normalizedMethods.includes('email') ||
    normalizedMethods.includes('otp') ||
    normalizedMethods.includes('totp') ||
    normalizedMethods.includes('phone') ||
    normalizedMethods.length > 1
  ) {
    return 'aal2';
  }

  return 'aal1';
}

export function isAssuranceSatisfied(
  currentLevel: AuthAssuranceLevel,
  requiredLevel: AuthAssuranceLevel = 'aal1',
): boolean {
  const rank: Record<AuthAssuranceLevel, number> = {
    anonymous: 0,
    aal1: 1,
    aal2: 2,
  };

  return rank[currentLevel] >= rank[requiredLevel];
}

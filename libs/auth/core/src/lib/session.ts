import type {
  AuthAssuranceLevel,
  AuthSession,
  AuthUser,
} from '@acme-los/auth/contracts';

export const MOCK_AUTH_STORAGE_KEY = 'acme-los-auth-mock-session';
export const LOCAL_DRAFT_STORAGE_KEY = 'acme-los-installment-draft';

export const EMPTY_AUTH_SESSION: AuthSession = {
  provider: 'mock',
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

export function createMockAuthUser(
  assuranceLevel: Exclude<AuthAssuranceLevel, 'anonymous'> = 'aal1',
): AuthUser {
  const authenticationMethods =
    assuranceLevel === 'aal2' ? ['pwd', 'email', 'mfa'] : ['pwd'];

  return {
    id: 'mock-customer-01',
    email: 'taylor.customer@acme-los.dev',
    displayName: 'Taylor Customer',
    firstName: 'Taylor',
    lastName: 'Customer',
    authenticationMethods,
  };
}

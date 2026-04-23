import type { WebAuthSessionAssuranceLevel } from '@acme-los/api/contracts';

export type WebAuthRequirement = {
  requiresAuthentication: boolean;
  minimumAssuranceLevel?: Exclude<WebAuthSessionAssuranceLevel, 'anonymous'>;
  requiredStepUp?: WebAuthStepUpRequirement;
};

export type WebAuthStepUpReason = 'funding';

export type WebAuthStepUpRequirement = {
  reason: WebAuthStepUpReason;
  maxAgeSeconds: number;
  consumeOnSatisfied?: boolean;
};

export const MOCK_AUTH_STORAGE_KEY = 'acme-los-auth-mock-session';

export function getAssuranceLevelFromAuthenticationMethods(
  authenticationMethods?: string[],
): WebAuthSessionAssuranceLevel {
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
  currentLevel: WebAuthSessionAssuranceLevel,
  requiredLevel: WebAuthSessionAssuranceLevel = 'aal1',
): boolean {
  const rank: Record<WebAuthSessionAssuranceLevel, number> = {
    anonymous: 0,
    aal1: 1,
    aal2: 2,
  };

  return rank[currentLevel] >= rank[requiredLevel];
}

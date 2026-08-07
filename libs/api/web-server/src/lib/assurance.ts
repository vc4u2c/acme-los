import type { WebAuthSessionAssuranceLevel } from '@acme-los/api/contracts';

export type WebAuthRequirement = {
  requiresAuthentication: boolean;
  minimumAssuranceLevel?: Exclude<WebAuthSessionAssuranceLevel, 'anonymous'>;
  requiredStepUp?: WebAuthStepUpRequirement;
};

export type WebAuthStepUpReason =
  | 'funding'
  | 'account-email'
  | 'account-phone'
  | 'account-password'
  | 'post-email-change'
  | 'post-phone-change'
  | 'post-password-change';

export type WebAuthStepUpRequirement = {
  reason: WebAuthStepUpReason;
  maxAgeSeconds: number;
  consumeOnSatisfied?: boolean;
};

export const MOCK_AUTH_STORAGE_KEY = 'acme-los-auth-mock-session';

const DEFAULT_HIGH_ASSURANCE_ACR_VALUES = ['urn:okta:loa:2fa:any'];
const SMS_FUNDING_AUTHENTICATION_METHODS = new Set([
  'sms',
  'phone',
  'phone:sms',
  'phone_number',
  'phone_number:sms',
]);
const EMAIL_AUTHENTICATION_METHODS = new Set([
  'email',
  'okta_email',
  'okta_email:email',
]);
const FUNDING_EMAIL_OR_SMS_METHOD = 'email_or_sms';

function normalizeClaimValues(value?: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim().toLowerCase();

    return trimmedValue ? [trimmedValue] : [];
  }

  return [];
}

export function isFundingStepUpMethodSatisfied({
  fundingStepUpMethod,
  authenticationMethods,
}: {
  fundingStepUpMethod?: string;
  authenticationMethods?: string[];
}): boolean {
  const normalizedFundingStepUpMethod = fundingStepUpMethod
    ?.trim()
    .toLowerCase();
  const normalizedAuthenticationMethods = normalizeClaimValues(
    authenticationMethods,
  );

  if (
    !normalizedFundingStepUpMethod ||
    normalizedFundingStepUpMethod === FUNDING_EMAIL_OR_SMS_METHOD
  ) {
    return normalizedAuthenticationMethods.some(
      (method) =>
        EMAIL_AUTHENTICATION_METHODS.has(method) ||
        SMS_FUNDING_AUTHENTICATION_METHODS.has(method),
    );
  }

  if (normalizedFundingStepUpMethod === 'email') {
    return normalizedAuthenticationMethods.some((method) =>
      EMAIL_AUTHENTICATION_METHODS.has(method),
    );
  }

  if (normalizedFundingStepUpMethod === 'sms') {
    return normalizedAuthenticationMethods.some((method) =>
      SMS_FUNDING_AUTHENTICATION_METHODS.has(method),
    );
  }

  return false;
}

export function isSmsAuthenticationMethodSatisfied(
  authenticationMethods?: string[],
): boolean {
  return normalizeClaimValues(authenticationMethods).some((method) =>
    SMS_FUNDING_AUTHENTICATION_METHODS.has(method),
  );
}

export function isEmailAuthenticationMethodSatisfied(
  authenticationMethods?: string[],
): boolean {
  return normalizeClaimValues(authenticationMethods).some((method) =>
    EMAIL_AUTHENTICATION_METHODS.has(method),
  );
}

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

export function getAssuranceLevelFromAuthenticationEvidence({
  authenticationMethods,
  acr,
  acceptedHighAssuranceAcrValues = DEFAULT_HIGH_ASSURANCE_ACR_VALUES,
}: {
  authenticationMethods?: string[];
  acr?: unknown;
  acceptedHighAssuranceAcrValues?: string[];
}): WebAuthSessionAssuranceLevel {
  const assuranceFromAuthenticationMethods =
    getAssuranceLevelFromAuthenticationMethods(authenticationMethods);

  if (assuranceFromAuthenticationMethods === 'aal2') {
    return 'aal2';
  }

  const acceptedAcrValues = new Set(
    acceptedHighAssuranceAcrValues
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const tokenAcrValues = normalizeClaimValues(acr);

  if (tokenAcrValues.some((value) => acceptedAcrValues.has(value))) {
    return 'aal2';
  }

  return assuranceFromAuthenticationMethods;
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

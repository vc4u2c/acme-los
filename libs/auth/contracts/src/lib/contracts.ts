export type AuthProviderKind = 'mock' | 'okta';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export type AuthAssuranceLevel = 'anonymous' | 'aal1' | 'aal2';
export type AuthStepUpReason =
  | 'funding'
  | 'account-email'
  | 'account-phone'
  | 'account-password';

export interface AuthStepUpRequirement {
  reason: AuthStepUpReason;
  maxAgeSeconds: number;
  consumeOnSatisfied?: boolean;
}

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  leadId?: string;
  customerId?: string;
  authenticationMethods?: string[];
}

export interface AuthSession {
  provider: AuthProviderKind;
  status: AuthStatus;
  isAuthenticated: boolean;
  assuranceLevel: AuthAssuranceLevel;
  user: AuthUser | null;
  errorMessage?: string;
}

export interface AuthRequirement {
  requiresAuthentication: boolean;
  minimumAssuranceLevel?: Exclude<AuthAssuranceLevel, 'anonymous'>;
  requiredStepUp?: AuthStepUpRequirement;
}

export interface SignInRequest {
  returnTo?: string;
  minimumAssuranceLevel?: Exclude<AuthAssuranceLevel, 'anonymous'>;
}

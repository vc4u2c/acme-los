export interface WebAuthSessionUser {
  id: string;
  email?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  leadId?: string;
  customerId?: string;
  authenticationMethods?: string[];
}

export type WebAuthSessionProvider = 'mock' | 'okta';
export type WebAuthSessionStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';
export type WebAuthSessionAssuranceLevel = 'anonymous' | 'aal1' | 'aal2';

export interface WebAuthSession {
  provider: WebAuthSessionProvider;
  status: WebAuthSessionStatus;
  isAuthenticated: boolean;
  assuranceLevel: WebAuthSessionAssuranceLevel;
  user: WebAuthSessionUser | null;
  errorMessage?: string;
}

export interface WebAuthSessionTiming {
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  idleTimeoutSeconds: number;
  warningSeconds: number;
  stepUp?: WebAuthSessionStepUpTiming;
}

export interface GetWebAuthSessionResponse {
  session: WebAuthSession;
  sessionTiming?: WebAuthSessionTiming;
}

export interface TouchWebAuthSessionResponse {
  session: WebAuthSession;
  sessionTiming?: WebAuthSessionTiming;
  touched: boolean;
}

export interface ClearWebAuthSessionResponse {
  session: WebAuthSession;
  cleared: boolean;
}

export type WebAuthStepUpReason =
  | 'funding'
  | 'account-email'
  | 'account-phone'
  | 'account-password'
  | 'post-email-change'
  | 'post-phone-change'
  | 'post-password-change';

export interface WebAuthStepUpRequirement {
  reason: WebAuthStepUpReason;
  maxAgeSeconds: number;
  consumeOnSatisfied?: boolean;
}

export interface WebAuthSessionStepUpTiming {
  reason: WebAuthStepUpReason;
  completedAt: number;
  expiresAt: number;
  consumedAt?: number;
}

export interface StartIdxAuthFlowRequest {
  returnTo?: string;
  minimumAssuranceLevel?: 'aal1' | 'aal2';
  expectedUserId?: string;
  leadId?: string;
  stepUp?: WebAuthStepUpRequirement;
}

export interface StartIdxAuthFlowResponse {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  acrValues: string | null;
  maxAgeSeconds: number | null;
  transactionId: string;
  maxAge: number;
  returnTo: string;
  stepUpReason: WebAuthStepUpReason | null;
}

export interface CompleteIdxAuthFlowRequest {
  interactionCode: string;
  state: string;
}

export interface CompleteAuthFlowResponse {
  session: WebAuthSession;
  returnTo: string;
  sessionTiming?: WebAuthSessionTiming;
}

export interface StartLogoutResponse {
  session: WebAuthSession;
  cleared: boolean;
  logoutUrl: string;
  usedOktaLogout: boolean;
}

export interface StartLogoutRequest {
  postLogoutRedirectUri?: string;
}

export interface RequireWebAuthSessionRequest {
  requiresAuthentication?: boolean;
  minimumAssuranceLevel?: WebAuthSessionAssuranceLevel;
  requiredStepUp?: WebAuthStepUpRequirement;
}

export interface RequireWebAuthSessionResponse {
  session: WebAuthSession;
  sessionTiming?: WebAuthSessionTiming;
  satisfied: boolean;
  errorMessage?: string;
}

export interface IssueCsrfTokenResponse {
  csrfToken: string;
}

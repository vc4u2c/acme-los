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
}

export interface WebAuthSessionDebugSnapshot {
  idTokenClaims: Record<string, unknown> | null;
  accessTokenClaims: Record<string, unknown> | null;
}

export interface GetWebAuthSessionResponse {
  session: WebAuthSession;
  sessionTiming?: WebAuthSessionTiming;
  debug?: WebAuthSessionDebugSnapshot;
}

export interface SyncWebAuthSessionRequest {
  idToken: string;
  leadId?: string;
  accessTokenClaims?: Record<string, unknown> | null;
}

export interface SyncWebAuthSessionResponse {
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

export interface IssueCsrfTokenResponse {
  csrfToken: string;
}

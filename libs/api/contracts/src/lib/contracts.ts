import type { PaginatedResult } from '@acme-los/core/types';
import type { LoanApplication } from '@acme-los/domain/application';
import type { BorrowerProfile } from '@acme-los/domain/borrower';
import type { LoanScenario } from '@acme-los/domain/loan';
import type { UnderwritingDecision } from '@acme-los/domain/underwriting';

export interface CreateApplicationRequest {
  borrower: BorrowerProfile;
  loan: LoanScenario;
}

export interface CreateApplicationResponse {
  application: LoanApplication;
}

export interface GetApplicationResponse {
  application: LoanApplication;
  borrower: BorrowerProfile;
  loan: LoanScenario;
  latestUnderwritingDecision?: UnderwritingDecision;
}

export interface UpdateBorrowerProfileRequest {
  borrowerId: string;
  profile: BorrowerProfile;
}

export interface UpdateBorrowerProfileResponse {
  borrower: BorrowerProfile;
}

export interface SubmitUnderwritingDecisionRequest {
  applicationId: string;
  decision: UnderwritingDecision;
}

export interface SubmitUnderwritingDecisionResponse {
  decision: UnderwritingDecision;
}

export interface PipelineSummaryItem {
  application: LoanApplication;
  borrower: BorrowerProfile;
  loan: LoanScenario;
}

export type PipelineSummaryResponse = PaginatedResult<PipelineSummaryItem>;

export interface CustomerProfile {
  email: string;
  phone: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

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

export interface WebAuthSessionDebugSnapshot {
  idTokenClaims: Record<string, unknown> | null;
  accessTokenClaims: Record<string, unknown> | null;
}

export interface GetWebAuthSessionResponse {
  session: WebAuthSession;
  debug?: WebAuthSessionDebugSnapshot;
}

export interface SyncWebAuthSessionRequest {
  idToken: string;
  leadId?: string;
  accessTokenClaims?: Record<string, unknown> | null;
}

export interface SyncWebAuthSessionResponse {
  session: WebAuthSession;
}

export interface ClearWebAuthSessionResponse {
  session: WebAuthSession;
  cleared: boolean;
}

export interface GetCustomerProfileResponse {
  profile: CustomerProfile;
}

export interface UpdateCustomerProfileRequest {
  profile: CustomerProfile;
}

export interface UpdateCustomerProfileResponse {
  profile: CustomerProfile;
}

export interface IssueCsrfTokenResponse {
  csrfToken: string;
}

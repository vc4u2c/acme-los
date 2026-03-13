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

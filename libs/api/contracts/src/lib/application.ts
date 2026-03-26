export type ApplicationStepKey =
  | 'personal-info'
  | 'disclosures'
  | 'income'
  | 'bank'
  | 'pre-approval'
  | 'documents-signing'
  | 'funding';

export interface ApplicationDraftSummary {
  applicationId: string;
  customerId?: string;
  leadId?: string;
  currentStep: ApplicationStepKey;
  completedSteps: ApplicationStepKey[];
  lastUpdatedAt: string;
}

export interface ApplicationStepDraft {
  applicationId: string;
  step: ApplicationStepKey;
  payload: Record<string, unknown>;
  summary: ApplicationDraftSummary;
}

export interface CreateApplicationRequest {
  customerId?: string;
  leadId?: string;
  initialStep?: ApplicationStepKey;
}

export interface CreateApplicationResponse {
  summary: ApplicationDraftSummary;
}

export interface GetApplicationStepResponse {
  draft: ApplicationStepDraft | null;
}

export interface SaveApplicationStepRequest {
  applicationId: string;
  step: ApplicationStepKey;
  payload: Record<string, unknown>;
}

export interface SaveApplicationStepResponse {
  draft: ApplicationStepDraft;
}

export interface SubmitApplicationRequest {
  applicationId: string;
}

export interface SubmitApplicationResponse {
  summary: ApplicationDraftSummary;
  submittedAt: string;
}

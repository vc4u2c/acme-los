export const applicationStepKeys = [
  'personal-info',
  'disclosures',
  'employment-income',
  'bank-card',
  'pre-approval',
  'documents-signing',
  'funding',
] as const;

export type ApplicationStepKey = (typeof applicationStepKeys)[number];

export interface ApplicationFlowSummary {
  applicationId: string;
  customerId?: string;
  leadId?: string;
  currentStep: ApplicationStepKey;
  completedSteps: ApplicationStepKey[];
  lastUpdatedAt: string;
}

export interface ApplicationStepState {
  step: ApplicationStepKey;
  payload: Record<string, unknown>;
  summary: ApplicationFlowSummary;
}

export interface CreateApplicationRequest {
  customerId?: string;
  leadId?: string;
  initialStep?: ApplicationStepKey;
}

export interface CreateApplicationResponse {
  summary: ApplicationFlowSummary;
}

export interface GetApplicationStepResponse {
  stepState: ApplicationStepState | null;
}

export interface SaveApplicationStepRequest {
  payload: Record<string, unknown>;
}

export interface SaveApplicationStepResponse {
  stepState: ApplicationStepState;
}

export interface SubmitApplicationRequest {
  step: ApplicationStepKey;
  payload?: Record<string, unknown>;
}

export interface SubmitApplicationResponse {
  summary: ApplicationFlowSummary;
  submittedAt: string;
}

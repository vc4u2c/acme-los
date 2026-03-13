import type {
  AuditFields,
  EntityId,
  UserReference,
} from '@acme-los/core/types';

export type ApplicationStage =
  | 'intake'
  | 'processing'
  | 'underwriting'
  | 'closing'
  | 'funded'
  | 'withdrawn';

export type ApplicationChannel = 'retail' | 'broker' | 'consumer-direct';

export interface LoanApplication extends AuditFields {
  applicationId: EntityId;
  borrowerId: EntityId;
  loanId: EntityId;
  stage: ApplicationStage;
  channel: ApplicationChannel;
  assignedTo?: UserReference;
  submittedAt?: string;
}

export function isApplicationSubmitted(application: LoanApplication): boolean {
  return (
    typeof application.submittedAt === 'string' &&
    application.submittedAt.length > 0
  );
}

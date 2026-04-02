import type {
  AuditFields,
  EntityId,
  UserReference,
} from '@acme-los/core/types';

export type ApplicationStage =
  | 'intake'
  | 'processing'
  | 'review'
  | 'closing'
  | 'funded'
  | 'withdrawn';

export type ApplicationChannel = 'retail' | 'broker' | 'consumer-direct';

export interface ApplicationRecord extends AuditFields {
  applicationId: EntityId;
  customerId: EntityId;
  stage: ApplicationStage;
  channel: ApplicationChannel;
  assignedTo?: UserReference;
  submittedAt?: string;
}

export function isApplicationSubmitted(
  application: ApplicationRecord,
): boolean {
  return (
    typeof application.submittedAt === 'string' &&
    application.submittedAt.length > 0
  );
}

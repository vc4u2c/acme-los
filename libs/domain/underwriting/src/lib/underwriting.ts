import type {
  AuditFields,
  EntityId,
  UserReference,
} from '@acme-los/core/types';

export type UnderwritingDecisionStatus =
  | 'approved'
  | 'approved-with-conditions'
  | 'suspended'
  | 'declined';

export interface UnderwritingCondition {
  conditionId: EntityId;
  title: string;
  description: string;
  isSatisfied: boolean;
  isBlocking: boolean;
}

export interface UnderwritingDecision extends AuditFields {
  decisionId: EntityId;
  applicationId: EntityId;
  status: UnderwritingDecisionStatus;
  decisionedBy: UserReference;
  notes?: string;
  conditions: UnderwritingCondition[];
}

export function hasOpenBlockingConditions(
  decision: UnderwritingDecision,
): boolean {
  return decision.conditions.some(
    (condition) => condition.isBlocking && !condition.isSatisfied,
  );
}

import type {
  Address,
  AuditFields,
  CurrencyCode,
  EntityId,
} from '@acme-los/core/types';

export type LoanPurpose = 'purchase' | 'refinance' | 'cash-out-refinance';
export type OccupancyType = 'primary-residence' | 'second-home' | 'investment';
export type PropertyType =
  | 'single-family'
  | 'condo'
  | 'townhome'
  | 'multi-family';

export interface LoanTerms {
  amortizationMonths: number;
  interestRateBps: number;
  purpose: LoanPurpose;
  occupancy: OccupancyType;
}

export interface SubjectProperty {
  address: Address;
  propertyType: PropertyType;
  estimatedValue: number;
}

export interface LoanScenario extends AuditFields {
  loanId: EntityId;
  currency: CurrencyCode;
  purchasePrice: number;
  downPaymentAmount: number;
  requestedLoanAmount: number;
  terms: LoanTerms;
  subjectProperty: SubjectProperty;
}

export function calculateLoanToValue(scenario: LoanScenario): number {
  if (scenario.subjectProperty.estimatedValue === 0) {
    return 0;
  }

  return scenario.requestedLoanAmount / scenario.subjectProperty.estimatedValue;
}

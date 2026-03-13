import type {
  Address,
  AuditFields,
  ContactInfo,
  EntityId,
} from '@acme-los/core/types';

export type EmploymentStatus =
  | 'employed'
  | 'self-employed'
  | 'retired'
  | 'unemployed';

export interface BorrowerName {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
}

export interface BorrowerEmployment {
  employerName: string;
  title: string;
  status: EmploymentStatus;
  annualIncome: number;
  startDate: string;
}

export interface BorrowerProfile extends AuditFields {
  borrowerId: EntityId;
  name: BorrowerName;
  contact: ContactInfo;
  dateOfBirth: string;
  primaryAddress: Address;
  mailingAddress?: Address;
  employment: BorrowerEmployment;
  creditScore?: number;
}

export function getBorrowerDisplayName(name: BorrowerName): string {
  return [name.firstName, name.middleName, name.lastName, name.suffix]
    .filter(Boolean)
    .join(' ');
}

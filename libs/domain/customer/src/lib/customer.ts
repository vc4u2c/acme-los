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

export interface CustomerName {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
}

export interface CustomerEmployment {
  employerName: string;
  title: string;
  status: EmploymentStatus;
  annualIncome: number;
  startDate: string;
}

export interface CustomerProfile extends AuditFields {
  customerId: EntityId;
  name: CustomerName;
  contact: ContactInfo;
  dateOfBirth: string;
  primaryAddress: Address;
  mailingAddress?: Address;
  employment: CustomerEmployment;
  creditScore?: number;
}

export function getCustomerDisplayName(name: CustomerName): string {
  return [name.firstName, name.middleName, name.lastName, name.suffix]
    .filter(Boolean)
    .join(' ');
}

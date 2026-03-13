export type EntityId = string;
export type IsoDateString = string;
export type CurrencyCode = 'USD';
export type CountryCode = 'US';

export interface AuditFields {
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: CountryCode;
}

export interface ContactInfo {
  email: string;
  phone: string;
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserReference {
  userId: EntityId;
  displayName: string;
  email: string;
}

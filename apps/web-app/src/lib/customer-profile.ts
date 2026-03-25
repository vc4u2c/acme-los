import type { CustomerProfile } from '@acme-los/api/contracts';

export type CustomerProfileDraft = CustomerProfile;

export const defaultCustomerProfileDraft: CustomerProfileDraft = {
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
};

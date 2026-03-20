export type CustomerProfileDraft = {
  email: string;
  phone: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
};

export const CUSTOMER_PROFILE_STORAGE_KEY = 'acme-los-customer-profile-draft';

export const defaultCustomerProfileDraft: CustomerProfileDraft = {
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
};

export function readCustomerProfileDraft(): CustomerProfileDraft {
  if (typeof window === 'undefined') {
    return defaultCustomerProfileDraft;
  }

  const rawValue = window.localStorage.getItem(CUSTOMER_PROFILE_STORAGE_KEY);
  if (!rawValue) {
    return defaultCustomerProfileDraft;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<CustomerProfileDraft>;
    return {
      ...defaultCustomerProfileDraft,
      ...parsed,
    };
  } catch {
    window.localStorage.removeItem(CUSTOMER_PROFILE_STORAGE_KEY);
    return defaultCustomerProfileDraft;
  }
}

export function persistCustomerProfileDraft(draft: CustomerProfileDraft): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    CUSTOMER_PROFILE_STORAGE_KEY,
    JSON.stringify(draft),
  );
}

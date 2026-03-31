import type { CustomerProfile, WebAuthSession } from '@acme-los/api/contracts';
import {
  deleteStateValue,
  readStateValue,
  writeStateValue,
} from './state-store';

const CUSTOMER_PROFILE_NAMESPACE = 'customer-profile';
const CUSTOMER_PROFILE_TTL_SECONDS = 60 * 60 * 24 * 30;

const emptyCustomerProfile: CustomerProfile = {
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
};

type StoredCustomerProfile = {
  profile: CustomerProfile;
};

function getCustomerProfileKey(session: WebAuthSession): string | null {
  return session.user?.id ?? null;
}

export async function readCustomerProfile(
  session: WebAuthSession,
): Promise<CustomerProfile> {
  const customerProfileKey = getCustomerProfileKey(session);
  const storedProfile = customerProfileKey
    ? await readStateValue<StoredCustomerProfile>(
        CUSTOMER_PROFILE_NAMESPACE,
        customerProfileKey,
      )
    : null;

  const email =
    storedProfile?.profile.email ||
    session.user?.email ||
    emptyCustomerProfile.email;

  return {
    ...emptyCustomerProfile,
    ...storedProfile?.profile,
    email,
  };
}

export async function writeCustomerProfile(
  session: WebAuthSession,
  profile: CustomerProfile,
): Promise<void> {
  const customerProfileKey = getCustomerProfileKey(session);
  if (!customerProfileKey) {
    return;
  }

  await writeStateValue(
    CUSTOMER_PROFILE_NAMESPACE,
    customerProfileKey,
    { profile } satisfies StoredCustomerProfile,
    CUSTOMER_PROFILE_TTL_SECONDS,
  );
}

export async function clearCustomerProfile(
  session: WebAuthSession,
): Promise<void> {
  const customerProfileKey = getCustomerProfileKey(session);
  if (!customerProfileKey) {
    return;
  }

  await deleteStateValue(CUSTOMER_PROFILE_NAMESPACE, customerProfileKey);
}

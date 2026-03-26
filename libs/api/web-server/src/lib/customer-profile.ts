import type { CustomerProfile, WebAuthSession } from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import {
  CUSTOMER_PROFILE_COOKIE_NAME,
  readSignedCookie,
  setSignedCookie,
} from './cookies';

const emptyCustomerProfile: CustomerProfile = {
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
};

type CustomerProfileCookiePayload = {
  profile: CustomerProfile;
};

export function readCustomerProfile(
  request: NextRequest,
  session: WebAuthSession,
): CustomerProfile {
  const cookiePayload = readSignedCookie<CustomerProfileCookiePayload>(
    request,
    CUSTOMER_PROFILE_COOKIE_NAME,
  );

  const email =
    cookiePayload?.profile.email ||
    session.user?.email ||
    emptyCustomerProfile.email;

  return {
    ...emptyCustomerProfile,
    ...cookiePayload?.profile,
    email,
  };
}

export function writeCustomerProfile(
  request: NextRequest,
  response: NextResponse,
  profile: CustomerProfile,
): void {
  setSignedCookie(
    response,
    request,
    CUSTOMER_PROFILE_COOKIE_NAME,
    { profile } satisfies CustomerProfileCookiePayload,
    {
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}

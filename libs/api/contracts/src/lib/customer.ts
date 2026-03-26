export interface CustomerProfile {
  email: string;
  phone: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface GetCustomerProfileResponse {
  profile: CustomerProfile;
}

export interface UpdateCustomerProfileRequest {
  profile: CustomerProfile;
}

export interface UpdateCustomerProfileResponse {
  profile: CustomerProfile;
}

export type AccountSecurityVerificationStatus =
  | 'pending_verification'
  | 'verified';

export interface StartEmailChangeRequest {
  email: string;
}

export interface StartEmailChangeResponse {
  emailId: string;
  challengeId: string;
  email: string;
  status: AccountSecurityVerificationStatus;
}

export interface VerifyEmailChangeRequest {
  emailId: string;
  challengeId: string;
  verificationCode: string;
}

export interface VerifyEmailChangeResponse {
  status: 'verified';
  email: string;
}

export interface StartPhoneChangeRequest {
  phoneNumber: string;
}

export interface StartPhoneChangeResponse {
  phoneId: string;
  phoneNumber: string;
  status: AccountSecurityVerificationStatus;
}

export interface VerifyPhoneChangeRequest {
  phoneId: string;
  verificationCode: string;
}

export interface VerifyPhoneChangeResponse {
  status: 'verified';
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  status: 'changed';
}

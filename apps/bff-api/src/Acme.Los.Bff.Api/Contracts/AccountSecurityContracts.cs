namespace Acme.Los.Bff.Api.Contracts;

public sealed record StartEmailChangeRequest(string Email);

public sealed record StartEmailChangeResponse(
  string EmailId,
  string ChallengeId,
  string Email,
  string Status);

public sealed record VerifyEmailChangeRequest(
  string EmailId,
  string ChallengeId,
  string VerificationCode);

public sealed record VerifyEmailChangeResponse(
  string Status,
  string Email);

public sealed record StartPhoneChangeRequest(string PhoneNumber);

public sealed record StartPhoneChangeResponse(
  string PhoneId,
  string PhoneNumber,
  string Status);

public sealed record VerifyPhoneChangeRequest(
  string PhoneId,
  string VerificationCode);

public sealed record VerifyPhoneChangeResponse(string Status);

public sealed record ChangePasswordRequest(
  string CurrentPassword,
  string NewPassword);

public sealed record ChangePasswordResponse(string Status);

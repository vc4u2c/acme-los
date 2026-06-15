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

public sealed record VerifyEmailChangeResponse(string Status);

public sealed record StartPhoneChangeRequest(string PhoneNumber);

public sealed record StartPhoneChangeResponse(
  string PhoneId,
  string PhoneNumber,
  string Status);

public sealed record VerifyPhoneChangeRequest(
  string PhoneId,
  string VerificationCode);

public sealed record VerifyPhoneChangeResponse(string Status);

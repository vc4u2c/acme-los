namespace Acme.Los.Bff.Api.Infrastructure.Auth;

internal static class AuthAssurance
{
  private static readonly string[] DefaultHighAssuranceAcrValues = new[]
  {
    "urn:okta:loa:2fa:any",
  };

  private static readonly string[] SmsFundingAuthenticationMethods = new[]
  {
    "sms",
    "phone",
    "phone:sms",
    "phone_number",
    "phone_number:sms",
  };
  private static readonly string[] EmailAuthenticationMethods = new[]
  {
    "email",
    "okta_email",
    "okta_email:email",
  };

  public static string GetAssuranceLevel(
    IEnumerable<string>? authenticationMethods,
    string? acr = null,
    IEnumerable<string>? acceptedHighAssuranceAcrValues = null)
  {
    var normalizedMethods = authenticationMethods?
      .Where(value => !string.IsNullOrWhiteSpace(value))
      .Select(value => value.Trim().ToLowerInvariant())
      .ToArray() ?? Array.Empty<string>();

    if (normalizedMethods.Length == 0)
    {
      return IsHighAssuranceAcr(
        acr,
        acceptedHighAssuranceAcrValues ?? DefaultHighAssuranceAcrValues)
        ? "aal2"
        : "anonymous";
    }

    if (normalizedMethods.Contains("mfa")
      || normalizedMethods.Contains("sms")
      || normalizedMethods.Contains("email")
      || normalizedMethods.Contains("otp")
      || normalizedMethods.Contains("totp")
      || normalizedMethods.Contains("phone")
      || normalizedMethods.Length > 1)
    {
      return "aal2";
    }

    return IsHighAssuranceAcr(
      acr,
      acceptedHighAssuranceAcrValues ?? DefaultHighAssuranceAcrValues)
      ? "aal2"
      : "aal1";
  }

  public static bool IsFundingStepUpMethodSatisfied(
    string? fundingStepUpMethod,
    IEnumerable<string>? authenticationMethods)
  {
    if (!string.Equals(
      fundingStepUpMethod?.Trim(),
      "sms",
      StringComparison.OrdinalIgnoreCase))
    {
      return true;
    }

    var normalizedMethods = authenticationMethods?
      .Where(value => !string.IsNullOrWhiteSpace(value))
      .Select(value => value.Trim().ToLowerInvariant())
      .ToArray() ?? Array.Empty<string>();

    return normalizedMethods.Any(method =>
      SmsFundingAuthenticationMethods.Contains(
        method,
        StringComparer.OrdinalIgnoreCase));
  }

  public static bool IsSmsAuthenticationMethodSatisfied(
    IEnumerable<string>? authenticationMethods)
  {
    var normalizedMethods = authenticationMethods?
      .Where(value => !string.IsNullOrWhiteSpace(value))
      .Select(value => value.Trim().ToLowerInvariant())
      .ToArray() ?? Array.Empty<string>();

    return normalizedMethods.Any(method =>
      SmsFundingAuthenticationMethods.Contains(
        method,
        StringComparer.OrdinalIgnoreCase));
  }

  public static bool IsEmailAuthenticationMethodSatisfied(
    IEnumerable<string>? authenticationMethods)
  {
    var normalizedMethods = authenticationMethods?
      .Where(value => !string.IsNullOrWhiteSpace(value))
      .Select(value => value.Trim().ToLowerInvariant())
      .ToArray() ?? Array.Empty<string>();

    return normalizedMethods.Any(method =>
      EmailAuthenticationMethods.Contains(
        method,
        StringComparer.OrdinalIgnoreCase));
  }

  private static bool IsHighAssuranceAcr(
    string? acr,
    IEnumerable<string> acceptedHighAssuranceAcrValues)
  {
    if (string.IsNullOrWhiteSpace(acr))
    {
      return false;
    }

    var acceptedValues = acceptedHighAssuranceAcrValues
      .Where(value => !string.IsNullOrWhiteSpace(value))
      .Select(value => value.Trim().ToLowerInvariant())
      .ToHashSet(StringComparer.OrdinalIgnoreCase);

    return acceptedValues.Contains(acr.Trim().ToLowerInvariant());
  }
}

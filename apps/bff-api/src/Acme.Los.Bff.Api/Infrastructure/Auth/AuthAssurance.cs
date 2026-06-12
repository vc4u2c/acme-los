namespace Acme.Los.Bff.Api.Infrastructure.Auth;

internal static class AuthAssurance
{
  private static readonly string[] DefaultHighAssuranceAcrValues = new[]
  {
    "urn:okta:loa:2fa:any",
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

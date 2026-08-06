namespace Acme.Los.Bff.Api.Infrastructure.Auth;

internal static class OktaIssuerPolicy
{
  internal static string NormalizeIssuer(string value)
  {
    return value.TrimEnd('/');
  }

  internal static bool IsAllowedIssuer(
    string configuredIssuer,
    string claimedIssuer,
    string? canonicalOrgUrl = null)
  {
    if (!Uri.TryCreate(configuredIssuer, UriKind.Absolute, out var configuredUri)
      || !Uri.TryCreate(claimedIssuer, UriKind.Absolute, out var claimedUri))
    {
      return false;
    }

    if (!string.Equals(claimedUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
      || !string.Equals(configuredUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
    {
      return false;
    }

    var allowedIssuers = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
      NormalizeIssuer(configuredUri.ToString()),
    };

    if (Uri.TryCreate(canonicalOrgUrl, UriKind.Absolute, out var canonicalOrgUri)
      && string.Equals(
        canonicalOrgUri.Scheme,
        Uri.UriSchemeHttps,
        StringComparison.OrdinalIgnoreCase))
    {
      allowedIssuers.Add(NormalizeIssuer(new UriBuilder(canonicalOrgUri)
      {
        Path = NormalizeIssuerPath(configuredUri.AbsolutePath),
        Query = string.Empty,
        Fragment = string.Empty,
      }.Uri.ToString()));
    }

    return allowedIssuers.Contains(NormalizeIssuer(claimedUri.ToString()));
  }

  private static string NormalizeIssuerPath(string value) =>
    value.TrimEnd('/');
}

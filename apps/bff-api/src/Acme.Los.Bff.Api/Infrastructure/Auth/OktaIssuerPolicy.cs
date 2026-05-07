using System.Text.RegularExpressions;

namespace Acme.Los.Bff.Api.Infrastructure.Auth;

internal static class OktaIssuerPolicy
{
  private static readonly Regex KnownOktaHostPattern = new(
    @"(^|\.)okta(?:preview|-emea|-gov)?\.com$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

  internal static string NormalizeIssuer(string value)
  {
    return value.TrimEnd('/');
  }

  internal static bool IsAllowedIssuer(
    string configuredIssuer,
    string claimedIssuer)
  {
    if (!Uri.TryCreate(configuredIssuer, UriKind.Absolute, out var configuredUri)
      || !Uri.TryCreate(claimedIssuer, UriKind.Absolute, out var claimedUri))
    {
      return false;
    }

    var configuredPath = NormalizeIssuerPath(configuredUri.AbsolutePath);
    var claimedPath = NormalizeIssuerPath(claimedUri.AbsolutePath);

    if (!string.Equals(claimedUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
      || !string.Equals(configuredPath, claimedPath, StringComparison.Ordinal))
    {
      return false;
    }

    if (string.Equals(claimedUri.Host, configuredUri.Host, StringComparison.OrdinalIgnoreCase))
    {
      return true;
    }

    return KnownOktaHostPattern.IsMatch(claimedUri.Host);
  }

  private static string NormalizeIssuerPath(string value)
  {
    return value.TrimEnd('/');
  }
}

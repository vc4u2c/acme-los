using Microsoft.Extensions.Configuration;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

internal enum OktaCustomerIdWritebackMode
{
  Disabled,
  Sample,
}

internal sealed record OktaCustomerIdWritebackOptions(
  OktaCustomerIdWritebackMode Mode,
  string? Issuer,
  string? ManagementClientId,
  string? ManagementPrivateKeyPem,
  string? ManagementPrivateKeyId,
  string[] ManagementScopes)
{
  private const string ModeEnvironmentName =
    "ACME_OKTA_CUSTOMER_ID_WRITEBACK_MODE";
  private const string IssuerEnvironmentName = "ACME_OKTA_ISSUER";
  private const string ClientIdEnvironmentName =
    "ACME_OKTA_MANAGEMENT_CLIENT_ID";
  private const string PrivateKeyPemEnvironmentName =
    "ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM";
  private const string PrivateKeyIdEnvironmentName =
    "ACME_OKTA_MANAGEMENT_PRIVATE_KEY_ID";
  private const string ScopesEnvironmentName = "ACME_OKTA_MANAGEMENT_SCOPES";

  internal bool IsEnabled => Mode == OktaCustomerIdWritebackMode.Sample;

  internal Uri OktaOrgBaseUri
  {
    get
    {
      if (string.IsNullOrWhiteSpace(Issuer))
      {
        throw new InvalidOperationException(
          "Okta issuer is required for customer id write-back.");
      }

      var issuerUri = new Uri(Issuer, UriKind.Absolute);

      if (!string.Equals(issuerUri.Scheme, Uri.UriSchemeHttps, StringComparison.Ordinal))
      {
        throw new InvalidOperationException(
          "Okta issuer must use HTTPS for customer id write-back.");
      }

      return new Uri($"{issuerUri.Scheme}://{issuerUri.Authority}/");
    }
  }

  internal Uri TokenEndpoint => new(OktaOrgBaseUri, "oauth2/v1/token");

  internal static OktaCustomerIdWritebackOptions FromConfiguration(
    IConfiguration configuration)
  {
    var mode = ReadMode(configuration[ModeEnvironmentName]);
    var scopes = ReadScopes(configuration[ScopesEnvironmentName]);
    var options = new OktaCustomerIdWritebackOptions(
      mode,
      TrimValue(configuration[IssuerEnvironmentName]),
      TrimValue(configuration[ClientIdEnvironmentName]),
      NormalizePrivateKeyPem(configuration[PrivateKeyPemEnvironmentName]),
      TrimValue(configuration[PrivateKeyIdEnvironmentName]),
      scopes);

    if (!options.IsEnabled)
    {
      return options;
    }

    _ = options.OktaOrgBaseUri;
    RequireValue(options.ManagementClientId, ClientIdEnvironmentName);
    RequireValue(options.ManagementPrivateKeyPem, PrivateKeyPemEnvironmentName);

    if (!options.ManagementScopes.Contains(
      "okta.users.manage",
      StringComparer.Ordinal))
    {
      throw new InvalidOperationException(
        $"{ScopesEnvironmentName} must include okta.users.manage for customer id write-back.");
    }

    return options;
  }

  private static OktaCustomerIdWritebackMode ReadMode(string? value)
  {
    var mode = TrimValue(value);

    if (mode is null || string.Equals(mode, "disabled", StringComparison.OrdinalIgnoreCase))
    {
      return OktaCustomerIdWritebackMode.Disabled;
    }

    if (string.Equals(mode, "sample", StringComparison.OrdinalIgnoreCase))
    {
      return OktaCustomerIdWritebackMode.Sample;
    }

    throw new InvalidOperationException(
      $"{ModeEnvironmentName} must be disabled or sample.");
  }

  private static string[] ReadScopes(string? value)
  {
    var scopes = TrimValue(value);

    if (scopes is null)
    {
      return ["okta.users.manage"];
    }

    return scopes
      .Split([' ', ',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
      .Distinct(StringComparer.Ordinal)
      .ToArray();
  }

  private static string? NormalizePrivateKeyPem(string? value)
  {
    var privateKeyPem = TrimValue(value);

    if (privateKeyPem is null)
    {
      return null;
    }

    return privateKeyPem.Contains("\\n", StringComparison.Ordinal)
      ? privateKeyPem.Replace("\\n", "\n", StringComparison.Ordinal)
      : privateKeyPem;
  }

  private static string RequireValue(string? value, string environmentName)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      throw new InvalidOperationException(
        $"{environmentName} is required when Okta customer id write-back is enabled.");
    }

    return value;
  }

  private static string? TrimValue(string? value)
  {
    var trimmed = value?.Trim();
    return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
  }
}

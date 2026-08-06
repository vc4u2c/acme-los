using Microsoft.Extensions.Configuration;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

internal enum OktaCustomerIdWritebackMode
{
  Disabled,
  Sample,
}

internal sealed record OktaCustomerIdWritebackOptions(
  OktaCustomerIdWritebackMode Mode,
  string? ManagementClientId,
  string? ManagementPrivateKeyPem,
  string? ManagementPrivateKeyId,
  string[] ManagementScopes,
  bool EmailLoginSyncEnabled,
  string? OrgUrl = null)
{
  private const string ModeEnvironmentName =
    "ACME_OKTA_CUSTOMER_ID_WRITEBACK_MODE";
  private const string OrgUrlEnvironmentName = "ACME_OKTA_ORG_URL";
  private const string ClientIdEnvironmentName =
    "ACME_OKTA_MANAGEMENT_CLIENT_ID";
  private const string PrivateKeyPemEnvironmentName =
    "ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM";
  private const string PrivateKeyIdEnvironmentName =
    "ACME_OKTA_MANAGEMENT_PRIVATE_KEY_ID";
  private const string ScopesEnvironmentName = "ACME_OKTA_MANAGEMENT_SCOPES";
  private const string EmailLoginSyncEnabledEnvironmentName =
    "ACME_OKTA_EMAIL_LOGIN_SYNC_ENABLED";

  internal bool IsEnabled => Mode == OktaCustomerIdWritebackMode.Sample;
  internal bool RequiresManagementToken => IsEnabled || EmailLoginSyncEnabled;

  internal Uri OktaOrgBaseUri
  {
    get
    {
      if (string.IsNullOrWhiteSpace(OrgUrl))
      {
        throw new InvalidOperationException(
          $"{OrgUrlEnvironmentName} is required for customer profile sync.");
      }

      var orgUri = new Uri(OrgUrl, UriKind.Absolute);

      if (!string.Equals(orgUri.Scheme, Uri.UriSchemeHttps, StringComparison.Ordinal))
      {
        throw new InvalidOperationException(
          "Okta org URL must use HTTPS for customer profile sync.");
      }

      if (!string.IsNullOrEmpty(orgUri.UserInfo)
        || orgUri.AbsolutePath != "/"
        || !string.IsNullOrEmpty(orgUri.Query)
        || !string.IsNullOrEmpty(orgUri.Fragment))
      {
        throw new InvalidOperationException(
          "Okta org URL must be an HTTPS origin without credentials, path, query, or fragment.");
      }

      return new Uri($"{orgUri.Scheme}://{orgUri.Authority}/");
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
      TrimValue(configuration[ClientIdEnvironmentName]),
      NormalizePrivateKeyPem(configuration[PrivateKeyPemEnvironmentName]),
      TrimValue(configuration[PrivateKeyIdEnvironmentName]),
      scopes,
      ReadBoolean(configuration[EmailLoginSyncEnabledEnvironmentName]),
      TrimValue(configuration[OrgUrlEnvironmentName]));

    if (!options.RequiresManagementToken)
    {
      return options;
    }

    _ = options.OktaOrgBaseUri;
    RequireValue(options.ManagementClientId, ClientIdEnvironmentName);
    RequireValue(options.ManagementPrivateKeyPem, PrivateKeyPemEnvironmentName);

    RequireScope(options, "okta.users.read");
    RequireScope(options, "okta.users.manage");

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
      return ["okta.users.read", "okta.users.manage"];
    }

    return scopes
      .Split([' ', ',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
      .Distinct(StringComparer.Ordinal)
      .ToArray();
  }

  private static bool ReadBoolean(string? value)
  {
    var trimmed = TrimValue(value);

    if (trimmed is null)
    {
      return false;
    }

    if (bool.TryParse(trimmed, out var parsed))
    {
      return parsed;
    }

    throw new InvalidOperationException(
      $"{EmailLoginSyncEnabledEnvironmentName} must be true or false.");
  }

  private static void RequireScope(
    OktaCustomerIdWritebackOptions options,
    string requiredScope)
  {
    if (options.ManagementScopes.Contains(requiredScope, StringComparer.Ordinal))
    {
      return;
    }

    throw new InvalidOperationException(
      $"{ScopesEnvironmentName} must include okta.users.read and okta.users.manage for Okta profile sync.");
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
        $"{environmentName} is required when Okta profile sync is enabled.");
    }

    return value;
  }

  private static string? TrimValue(string? value)
  {
    var trimmed = value?.Trim();
    return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
  }
}

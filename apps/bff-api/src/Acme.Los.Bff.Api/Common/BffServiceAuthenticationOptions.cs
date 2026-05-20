namespace Acme.Los.Bff.Api.Common;

internal sealed class BffServiceAuthenticationOptions
{
  private const string ServiceAuthModeEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_MODE";
  private const string TenantIdEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_TENANT_ID";
  private const string AudienceEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_AUDIENCE";
  private const string AllowedClientIdsEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS";
  private const string AllowedObjectIdsEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_ALLOWED_OBJECT_IDS";
  private const string JwksUrlEnvironmentName =
    "ACME_BFF_SERVICE_AUTH_JWKS_URL";

  private BffServiceAuthenticationOptions(
    string mode,
    string? tenantId,
    string? audience,
    IReadOnlySet<string> allowedClientIds,
    IReadOnlySet<string> allowedObjectIds,
    string? jwksUrl)
  {
    Mode = mode;
    TenantId = tenantId;
    Audience = audience;
    AllowedClientIds = allowedClientIds;
    AllowedObjectIds = allowedObjectIds;
    JwksUrl = jwksUrl;
  }

  internal string Mode { get; }
  internal string? TenantId { get; }
  internal string? Audience { get; }
  internal IReadOnlySet<string> AllowedClientIds { get; }
  internal IReadOnlySet<string> AllowedObjectIds { get; }
  internal string? JwksUrl { get; }
  internal bool IsRequired => string.Equals(Mode, "entra", StringComparison.Ordinal);

  internal bool IsFullyConfigured =>
    !string.IsNullOrWhiteSpace(TenantId)
    && !string.IsNullOrWhiteSpace(Audience)
    && !string.IsNullOrWhiteSpace(JwksUrl)
    && (AllowedClientIds.Count > 0 || AllowedObjectIds.Count > 0);

  internal IReadOnlyList<string> ValidIssuers =>
    string.IsNullOrWhiteSpace(TenantId)
      ? []
      : [
        $"https://sts.windows.net/{TenantId}/",
        $"https://login.microsoftonline.com/{TenantId}/",
        $"https://login.microsoftonline.com/{TenantId}/v2.0",
      ];

  internal static BffServiceAuthenticationOptions FromEnvironment()
  {
    var mode = ReadOptionalEnvironmentValue(ServiceAuthModeEnvironmentName)
      ?? "disabled";
    var normalizedMode = mode.Trim().ToLowerInvariant();

    if (normalizedMode is "off" or "none")
    {
      normalizedMode = "disabled";
    }

    if (normalizedMode is not ("disabled" or "entra"))
    {
      throw new InvalidOperationException(
        $"Unsupported {ServiceAuthModeEnvironmentName} value '{mode}'. Use 'disabled' or 'entra'.");
    }

    var tenantId = ReadOptionalEnvironmentValue(TenantIdEnvironmentName);
    var jwksUrl = ReadOptionalEnvironmentValue(JwksUrlEnvironmentName)
      ?? BuildDefaultJwksUrl(tenantId);

    return new BffServiceAuthenticationOptions(
      normalizedMode,
      tenantId,
      ReadOptionalEnvironmentValue(AudienceEnvironmentName),
      ReadEnvironmentSet(AllowedClientIdsEnvironmentName),
      ReadEnvironmentSet(AllowedObjectIdsEnvironmentName),
      jwksUrl);
  }

  private static string? BuildDefaultJwksUrl(string? tenantId)
  {
    return string.IsNullOrWhiteSpace(tenantId)
      ? null
      : $"https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys";
  }

  private static string? ReadOptionalEnvironmentValue(string name)
  {
    var value = Environment.GetEnvironmentVariable(name)?.Trim();
    return string.IsNullOrWhiteSpace(value) ? null : value;
  }

  private static IReadOnlySet<string> ReadEnvironmentSet(string name)
  {
    var value = ReadOptionalEnvironmentValue(name);

    return string.IsNullOrWhiteSpace(value)
      ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
      : value
        .Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(item => !string.IsNullOrWhiteSpace(item))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
  }
}

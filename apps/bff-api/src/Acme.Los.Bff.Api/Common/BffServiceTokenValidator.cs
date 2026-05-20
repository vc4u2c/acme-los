using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Los.Bff.Api.Common;

public interface IBffServiceTokenValidator
{
  Task<BffServiceTokenValidationResult> ValidateAsync(
    string token,
    CancellationToken cancellationToken);
}

public sealed record BffServiceTokenValidationResult(
  bool IsValid,
  string? ClientId = null,
  string? ObjectId = null)
{
  public static BffServiceTokenValidationResult Valid(
    string? clientId,
    string? objectId)
  {
    return new BffServiceTokenValidationResult(true, clientId, objectId);
  }

  public static BffServiceTokenValidationResult Invalid()
  {
    return new BffServiceTokenValidationResult(false);
  }
}

internal sealed class EntraBffServiceTokenValidator : IBffServiceTokenValidator
{
  private static readonly TimeSpan SigningKeyCacheDuration = TimeSpan.FromHours(6);

  private readonly BffServiceAuthenticationOptions _options;
  private readonly HttpClient _httpClient;
  private readonly ILogger<EntraBffServiceTokenValidator> _logger;
  private readonly SemaphoreSlim _signingKeyLock = new(1, 1);

  private IReadOnlyCollection<SecurityKey>? _cachedSigningKeys;
  private DateTimeOffset _cachedSigningKeysExpiresAt;

  public EntraBffServiceTokenValidator(
    BffServiceAuthenticationOptions options,
    HttpClient httpClient,
    ILogger<EntraBffServiceTokenValidator> logger)
  {
    _options = options;
    _httpClient = httpClient;
    _logger = logger;
  }

  public async Task<BffServiceTokenValidationResult> ValidateAsync(
    string token,
    CancellationToken cancellationToken)
  {
    if (!_options.IsFullyConfigured)
    {
      _logger.LogError(
        "BFF service authentication is enabled but tenant, audience, JWKS URL, or allowed caller configuration is missing.");
      return BffServiceTokenValidationResult.Invalid();
    }

    try
    {
      var validationParameters = new TokenValidationParameters
      {
        ValidateIssuerSigningKey = true,
        IssuerSigningKeys = await GetSigningKeysAsync(cancellationToken),
        ValidateIssuer = true,
        ValidIssuers = _options.ValidIssuers,
        ValidateAudience = true,
        ValidAudience = _options.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(2),
        NameClaimType = "oid",
      };
      var tokenHandler = new JsonWebTokenHandler
      {
        MapInboundClaims = false,
      };
      var result = await tokenHandler.ValidateTokenAsync(
        token,
        validationParameters);

      if (!result.IsValid)
      {
        _logger.LogWarning(
          result.Exception,
          "BFF service identity token validation failed.");
        return BffServiceTokenValidationResult.Invalid();
      }

      return ValidateCaller(result.ClaimsIdentity);
    }
    catch (Exception exception) when (exception is not OperationCanceledException)
    {
      _logger.LogWarning(
        exception,
        "BFF service identity token validation could not complete.");
      return BffServiceTokenValidationResult.Invalid();
    }
  }

  private BffServiceTokenValidationResult ValidateCaller(
    ClaimsIdentity? identity)
  {
    var clientId =
      ReadClaim(identity, "azp")
      ?? ReadClaim(identity, "appid")
      ?? ReadClaim(identity, "client_id");
    var objectId = ReadClaim(identity, "oid");
    var clientIdAccepted =
      clientId is not null && _options.AllowedClientIds.Contains(clientId);
    var objectIdAccepted =
      objectId is not null && _options.AllowedObjectIds.Contains(objectId);

    return clientIdAccepted || objectIdAccepted
      ? BffServiceTokenValidationResult.Valid(clientId, objectId)
      : BffServiceTokenValidationResult.Invalid();
  }

  private async Task<IReadOnlyCollection<SecurityKey>> GetSigningKeysAsync(
    CancellationToken cancellationToken)
  {
    if (
      _cachedSigningKeys is not null
      && _cachedSigningKeysExpiresAt > DateTimeOffset.UtcNow)
    {
      return _cachedSigningKeys;
    }

    await _signingKeyLock.WaitAsync(cancellationToken);

    try
    {
      if (
        _cachedSigningKeys is not null
        && _cachedSigningKeysExpiresAt > DateTimeOffset.UtcNow)
      {
        return _cachedSigningKeys;
      }

      var jwksJson = await _httpClient.GetStringAsync(
        _options.JwksUrl,
        cancellationToken);
      var keySet = new JsonWebKeySet(jwksJson);

      if (keySet.Keys.Count == 0)
      {
        throw new InvalidOperationException(
          "The configured BFF service auth JWKS endpoint returned no signing keys.");
      }

      _cachedSigningKeys = keySet.Keys.Cast<SecurityKey>().ToArray();
      _cachedSigningKeysExpiresAt =
        DateTimeOffset.UtcNow.Add(SigningKeyCacheDuration);

      return _cachedSigningKeys;
    }
    finally
    {
      _signingKeyLock.Release();
    }
  }

  private static string? ReadClaim(ClaimsIdentity? identity, string claimType)
  {
    return identity?.FindFirst(claimType)?.Value.Trim();
  }
}

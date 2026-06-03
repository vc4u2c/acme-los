using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

internal interface IOktaManagementTokenClient
{
  Task<string> GetAccessTokenAsync(CancellationToken cancellationToken);
}

internal sealed class OktaManagementTokenClient : IOktaManagementTokenClient
{
  private const string ClientAssertionType =
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

  private readonly IHttpClientFactory _httpClientFactory;
  private readonly OktaCustomerIdWritebackOptions _options;
  private readonly SemaphoreSlim _refreshLock = new(1, 1);
  private CachedAccessToken? _cachedAccessToken;

  public OktaManagementTokenClient(
    IHttpClientFactory httpClientFactory,
    OktaCustomerIdWritebackOptions options)
  {
    _httpClientFactory = httpClientFactory;
    _options = options;
  }

  public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
  {
    var cachedAccessToken = _cachedAccessToken;
    if (cachedAccessToken is not null && !cachedAccessToken.ExpiresSoon)
    {
      return cachedAccessToken.Token;
    }

    await _refreshLock.WaitAsync(cancellationToken);

    try
    {
      cachedAccessToken = _cachedAccessToken;
      if (cachedAccessToken is not null && !cachedAccessToken.ExpiresSoon)
      {
        return cachedAccessToken.Token;
      }

      var nextAccessToken = await RequestAccessTokenAsync(cancellationToken);
      _cachedAccessToken = nextAccessToken;

      return nextAccessToken.Token;
    }
    finally
    {
      _refreshLock.Release();
    }
  }

  private async Task<CachedAccessToken> RequestAccessTokenAsync(
    CancellationToken cancellationToken)
  {
    var tokenEndpoint = _options.TokenEndpoint;
    var requestBody = new Dictionary<string, string>
    {
      ["grant_type"] = "client_credentials",
      ["scope"] = string.Join(' ', _options.ManagementScopes),
      ["client_assertion_type"] = ClientAssertionType,
      ["client_assertion"] = CreateClientAssertion(tokenEndpoint),
    };
    using var request = new HttpRequestMessage(HttpMethod.Post, tokenEndpoint)
    {
      Content = new FormUrlEncodedContent(requestBody),
    };

    request.Headers.Accept.ParseAdd("application/json");

    using var response = await _httpClientFactory
      .CreateClient(nameof(OktaManagementTokenClient))
      .SendAsync(request, cancellationToken);

    if (!response.IsSuccessStatusCode)
    {
      throw new InvalidOperationException(
        $"Okta management token request failed ({(int)response.StatusCode}).");
    }

    var tokenResponse = await response.Content.ReadFromJsonAsync<OktaTokenResponse>(
      cancellationToken);

    if (
      tokenResponse?.AccessToken is null
      || !string.Equals(tokenResponse.TokenType, "Bearer", StringComparison.OrdinalIgnoreCase))
    {
      throw new InvalidOperationException(
        "Okta management token response did not include a bearer access token.");
    }

    return new CachedAccessToken(
      tokenResponse.AccessToken,
      DateTimeOffset.UtcNow.AddSeconds(Math.Max(tokenResponse.ExpiresIn, 60)));
  }

  private string CreateClientAssertion(Uri tokenEndpoint)
  {
    using var rsa = RSA.Create();

    rsa.ImportFromPem(_options.ManagementPrivateKeyPem!);

    var key = new RsaSecurityKey(rsa)
    {
      KeyId = _options.ManagementPrivateKeyId,
    };
    var now = DateTime.UtcNow;
    var tokenDescriptor = new SecurityTokenDescriptor
    {
      Audience = tokenEndpoint.ToString(),
      Expires = now.AddMinutes(5),
      IssuedAt = now,
      Issuer = _options.ManagementClientId!,
      NotBefore = now.AddMinutes(-1),
      SigningCredentials = new SigningCredentials(
        key,
        SecurityAlgorithms.RsaSha256),
      Subject = new ClaimsIdentity(
        [
          new Claim(JwtRegisteredClaimNames.Sub, _options.ManagementClientId!),
          new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        ]),
    };

    return new JsonWebTokenHandler().CreateToken(tokenDescriptor);
  }

  private sealed record CachedAccessToken(
    string Token,
    DateTimeOffset ExpiresAt)
  {
    internal bool ExpiresSoon =>
      ExpiresAt <= DateTimeOffset.UtcNow.AddSeconds(60);
  }

  private sealed record OktaTokenResponse(
    [property: System.Text.Json.Serialization.JsonPropertyName("access_token")]
    string? AccessToken,
    [property: System.Text.Json.Serialization.JsonPropertyName("token_type")]
    string? TokenType,
    [property: System.Text.Json.Serialization.JsonPropertyName("expires_in")]
    int ExpiresIn);
}

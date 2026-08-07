using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

internal interface IOktaManagementTokenClient
{
  Task<string> GetAccessTokenAsync(CancellationToken cancellationToken);

  Task<HttpResponseMessage> SendAuthorizedAsync(
    HttpClient httpClient,
    HttpRequestMessage request,
    CancellationToken cancellationToken);
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
    var cachedAccessToken = await GetCachedAccessTokenAsync(cancellationToken);

    return cachedAccessToken.Token;
  }

  public async Task<HttpResponseMessage> SendAuthorizedAsync(
    HttpClient httpClient,
    HttpRequestMessage request,
    CancellationToken cancellationToken)
  {
    var accessToken = await GetCachedAccessTokenAsync(cancellationToken);
    using var retryRequest = accessToken.UsesDpop
      ? await CloneRequestAsync(request, cancellationToken)
      : null;

    ApplyAuthorization(request, accessToken);
    var response = await httpClient.SendAsync(request, cancellationToken);

    if (
      !accessToken.UsesDpop
      || response.IsSuccessStatusCode
      || !TryReadDpopNonce(response, out var nonce)
      || retryRequest is null)
    {
      return response;
    }

    response.Dispose();
    ApplyAuthorization(retryRequest, accessToken, nonce);

    return await httpClient.SendAsync(retryRequest, cancellationToken);
  }

  private async Task<CachedAccessToken> GetCachedAccessTokenAsync(
    CancellationToken cancellationToken)
  {
    var cachedAccessToken = _cachedAccessToken;
    if (cachedAccessToken is not null && !cachedAccessToken.ExpiresSoon)
    {
      return cachedAccessToken;
    }

    await _refreshLock.WaitAsync(cancellationToken);

    try
    {
      cachedAccessToken = _cachedAccessToken;
      if (cachedAccessToken is not null && !cachedAccessToken.ExpiresSoon)
      {
        return cachedAccessToken;
      }

      var nextAccessToken = await RequestAccessTokenAsync(cancellationToken);
      _cachedAccessToken = nextAccessToken;

      return nextAccessToken;
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
    using var firstResponse = await SendTokenRequestAsync(
      tokenEndpoint,
      nonce: null,
      cancellationToken);

    HttpResponseMessage response = firstResponse;
    HttpResponseMessage? retryResponse = null;

    if (!response.IsSuccessStatusCode && TryReadDpopNonce(response, out var nonce))
    {
      retryResponse = await SendTokenRequestAsync(
        tokenEndpoint,
        nonce,
        cancellationToken);
      response = retryResponse;
    }

    try
    {
      if (!response.IsSuccessStatusCode)
      {
        throw new InvalidOperationException(
          $"Okta management token request failed ({(int)response.StatusCode}).");
      }

      var tokenResponse =
        await response.Content.ReadFromJsonAsync<OktaTokenResponse>(
          cancellationToken);

      if (
        tokenResponse?.AccessToken is null
        || tokenResponse.TokenType is null
        || !IsSupportedTokenType(tokenResponse.TokenType))
      {
        throw new InvalidOperationException(
          "Okta management token response did not include a supported access token.");
      }

      return new CachedAccessToken(
        tokenResponse.AccessToken,
        tokenResponse.TokenType,
        DateTimeOffset.UtcNow.AddSeconds(Math.Max(tokenResponse.ExpiresIn, 60)));
    }
    finally
    {
      retryResponse?.Dispose();
    }
  }

  private async Task<HttpResponseMessage> SendTokenRequestAsync(
    Uri tokenEndpoint,
    string? nonce,
    CancellationToken cancellationToken)
  {
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
    request.Headers.TryAddWithoutValidation(
      "DPoP",
      CreateDpopProof(
        HttpMethod.Post.Method,
        tokenEndpoint,
        accessToken: null,
        nonce));

    return await _httpClientFactory
      .CreateClient(nameof(OktaManagementTokenClient))
      .SendAsync(request, cancellationToken);
  }

  private void ApplyAuthorization(
    HttpRequestMessage request,
    CachedAccessToken accessToken,
    string? nonce = null)
  {
    if (!accessToken.UsesDpop)
    {
      request.Headers.Authorization = new AuthenticationHeaderValue(
        "Bearer",
        accessToken.Token);
      return;
    }

    var requestUri = request.RequestUri
      ?? throw new InvalidOperationException(
        "Okta management request URI is required for DPoP.");

    request.Headers.Authorization = new AuthenticationHeaderValue(
      "DPoP",
      accessToken.Token);
    request.Headers.Remove("DPoP");
    request.Headers.TryAddWithoutValidation(
      "DPoP",
      CreateDpopProof(
        request.Method.Method,
        requestUri,
        accessToken.Token,
        nonce));
  }

  private string CreateClientAssertion(Uri tokenEndpoint)
  {
    using var rsa = CreateRsaFromPrivateKey(_options.ManagementPrivateKeyPem!);
    var privateKeyId = ResolvePrivateKeyId();
    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var protectedHeader = new Dictionary<string, object?>
    {
      ["alg"] = SecurityAlgorithms.RsaSha256,
    };
    var payload = new Dictionary<string, object?>
    {
      ["iss"] = _options.ManagementClientId!,
      ["sub"] = _options.ManagementClientId!,
      ["aud"] = tokenEndpoint.ToString(),
      ["iat"] = now,
      ["nbf"] = now - 60,
      ["exp"] = now + 300,
      ["jti"] = Guid.NewGuid().ToString("N"),
    };

    if (!string.IsNullOrWhiteSpace(privateKeyId))
    {
      protectedHeader["kid"] = privateKeyId;
    }

    return CreateSignedJwt(protectedHeader, payload, rsa);
  }

  private string CreateDpopProof(
    string method,
    Uri requestUri,
    string? accessToken,
    string? nonce)
  {
    using var rsa = CreateRsaFromPrivateKey(_options.ManagementPrivateKeyPem!);
    var protectedHeader = new Dictionary<string, object?>
    {
      ["typ"] = "dpop+jwt",
      ["alg"] = SecurityAlgorithms.RsaSha256,
      ["jwk"] = BuildPublicJwk(rsa),
    };
    var payload = new Dictionary<string, object?>
    {
      ["htm"] = method.ToUpperInvariant(),
      ["htu"] = BuildDpopHtu(requestUri),
      ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
      ["jti"] = Guid.NewGuid().ToString("N"),
    };

    if (!string.IsNullOrWhiteSpace(accessToken))
    {
      payload["ath"] = Base64UrlEncoder.Encode(
        SHA256.HashData(Encoding.UTF8.GetBytes(accessToken)));
    }

    if (!string.IsNullOrWhiteSpace(nonce))
    {
      payload["nonce"] = nonce;
    }

    return CreateSignedJwt(protectedHeader, payload, rsa);
  }

  private static string CreateSignedJwt(
    IReadOnlyDictionary<string, object?> protectedHeader,
    IReadOnlyDictionary<string, object?> payload,
    RSA rsa)
  {
    var signingInput = string.Join(
      '.',
      Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(protectedHeader)),
      Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(payload)));
    var signature = rsa.SignData(
      Encoding.ASCII.GetBytes(signingInput),
      HashAlgorithmName.SHA256,
      RSASignaturePadding.Pkcs1);

    return $"{signingInput}.{Base64UrlEncoder.Encode(signature)}";
  }

  private Dictionary<string, object?> BuildPublicJwk(RSA rsa)
  {
    var parameters = rsa.ExportParameters(false);
    var privateKeyId = ResolvePrivateKeyId();
    var jwk = new Dictionary<string, object?>
    {
      ["kty"] = "RSA",
      ["e"] = Base64UrlEncoder.Encode(parameters.Exponent!),
      ["n"] = Base64UrlEncoder.Encode(parameters.Modulus!),
      ["alg"] = SecurityAlgorithms.RsaSha256,
      ["use"] = "sig",
    };

    if (!string.IsNullOrWhiteSpace(privateKeyId))
    {
      jwk["kid"] = privateKeyId;
    }

    return jwk;
  }

  private string? ResolvePrivateKeyId()
  {
    return string.IsNullOrWhiteSpace(_options.ManagementPrivateKeyId)
      ? ReadPrivateJwkKeyId(_options.ManagementPrivateKeyPem!)
      : _options.ManagementPrivateKeyId;
  }

  private static RSA CreateRsaFromPrivateKey(string privateKey)
  {
    var trimmedPrivateKey = privateKey.Trim();
    var rsa = RSA.Create();

    if (!trimmedPrivateKey.StartsWith('{'))
    {
      rsa.ImportFromPem(privateKey);
      return rsa;
    }

    using var document = JsonDocument.Parse(trimmedPrivateKey);
    var root = document.RootElement;
    if (
      !root.TryGetProperty("kty", out var keyType)
      || !string.Equals(
        keyType.GetString(),
        "RSA",
        StringComparison.OrdinalIgnoreCase))
    {
      throw new InvalidOperationException(
        "Okta management private key JWK must be an RSA key.");
    }

    rsa.ImportParameters(
      new RSAParameters
      {
        Modulus = ReadBase64UrlParameter(root, "n"),
        Exponent = ReadBase64UrlParameter(root, "e"),
        D = ReadBase64UrlParameter(root, "d"),
        P = ReadBase64UrlParameter(root, "p"),
        Q = ReadBase64UrlParameter(root, "q"),
        DP = ReadBase64UrlParameter(root, "dp"),
        DQ = ReadBase64UrlParameter(root, "dq"),
        InverseQ = ReadBase64UrlParameter(root, "qi"),
      });

    return rsa;
  }

  private static byte[] ReadBase64UrlParameter(JsonElement root, string name)
  {
    if (
      !root.TryGetProperty(name, out var value)
      || value.ValueKind != JsonValueKind.String
      || string.IsNullOrWhiteSpace(value.GetString()))
    {
      throw new InvalidOperationException(
        $"Okta management private key JWK is missing parameter \"{name}\".");
    }

    return Base64UrlEncoder.DecodeBytes(value.GetString());
  }

  private static string? ReadPrivateJwkKeyId(string privateKey)
  {
    var trimmedPrivateKey = privateKey.Trim();
    if (!trimmedPrivateKey.StartsWith('{'))
    {
      return null;
    }

    using var document = JsonDocument.Parse(trimmedPrivateKey);
    return document.RootElement.TryGetProperty("kid", out var value)
      && value.ValueKind == JsonValueKind.String
      ? value.GetString()
      : null;
  }

  private static bool IsSupportedTokenType(string tokenType)
  {
    return string.Equals(tokenType, "Bearer", StringComparison.OrdinalIgnoreCase)
      || string.Equals(tokenType, "DPoP", StringComparison.OrdinalIgnoreCase);
  }

  private static bool TryReadDpopNonce(
    HttpResponseMessage response,
    out string? nonce)
  {
    nonce = response.Headers.TryGetValues("dpop-nonce", out var values)
      ? values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
      : null;

    return !string.IsNullOrWhiteSpace(nonce);
  }

  private static string BuildDpopHtu(Uri requestUri)
  {
    return new UriBuilder(requestUri)
    {
      Query = string.Empty,
      Fragment = string.Empty,
    }.Uri.ToString();
  }

  private static async Task<HttpRequestMessage> CloneRequestAsync(
    HttpRequestMessage request,
    CancellationToken cancellationToken)
  {
    var clone = new HttpRequestMessage(request.Method, request.RequestUri)
    {
      Version = request.Version,
      VersionPolicy = request.VersionPolicy,
    };

    foreach (var header in request.Headers)
    {
      clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
    }

    if (request.Content is null)
    {
      return clone;
    }

    var content = await request.Content.ReadAsByteArrayAsync(cancellationToken);
    clone.Content = new ByteArrayContent(content);

    foreach (var header in request.Content.Headers)
    {
      clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
    }

    return clone;
  }

  private sealed record CachedAccessToken(
    string Token,
    string TokenType,
    DateTimeOffset ExpiresAt)
  {
    internal bool ExpiresSoon =>
      ExpiresAt <= DateTimeOffset.UtcNow.AddSeconds(60);

    internal bool UsesDpop =>
      string.Equals(TokenType, "DPoP", StringComparison.OrdinalIgnoreCase);
  }

  private sealed record OktaTokenResponse(
    [property: System.Text.Json.Serialization.JsonPropertyName("access_token")]
    string? AccessToken,
    [property: System.Text.Json.Serialization.JsonPropertyName("token_type")]
    string? TokenType,
    [property: System.Text.Json.Serialization.JsonPropertyName("expires_in")]
    int ExpiresIn);
}

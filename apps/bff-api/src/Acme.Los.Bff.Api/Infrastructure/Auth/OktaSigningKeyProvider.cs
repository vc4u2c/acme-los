using System.Collections.Concurrent;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Los.Bff.Api.Infrastructure.Auth;

public interface IOktaSigningKeyProvider
{
  Task<IReadOnlyCollection<SecurityKey>> GetSigningKeysAsync(
    string issuer,
    string? requiredKeyId,
    CancellationToken cancellationToken);
}

internal sealed class OktaSigningKeyProvider : IOktaSigningKeyProvider
{
  private static readonly TimeSpan SigningKeyCacheDuration = TimeSpan.FromMinutes(5);
  private static readonly TimeSpan UnknownKeyRefreshCooldown = TimeSpan.FromMinutes(1);

  private readonly IHttpClientFactory _httpClientFactory;
  private readonly ConcurrentDictionary<string, SigningKeyCacheEntry> _cache = new(StringComparer.Ordinal);
  private readonly ConcurrentDictionary<string, SemaphoreSlim> _issuerLocks = new(StringComparer.Ordinal);

  public OktaSigningKeyProvider(IHttpClientFactory httpClientFactory)
  {
    _httpClientFactory = httpClientFactory;
  }

  public async Task<IReadOnlyCollection<SecurityKey>> GetSigningKeysAsync(
    string issuer,
    string? requiredKeyId,
    CancellationToken cancellationToken)
  {
    var normalizedIssuer = OktaIssuerPolicy.NormalizeIssuer(issuer);

    if (TryGetCachedKeys(normalizedIssuer, requiredKeyId, out var cachedKeys))
    {
      return cachedKeys;
    }

    var issuerLock = _issuerLocks.GetOrAdd(normalizedIssuer, _ => new SemaphoreSlim(1, 1));
    await issuerLock.WaitAsync(cancellationToken);

    try
    {
      if (TryGetCachedKeys(normalizedIssuer, requiredKeyId, out cachedKeys))
      {
        return cachedKeys;
      }

      var now = DateTimeOffset.UtcNow;
      if (
        _cache.TryGetValue(normalizedIssuer, out var cached)
        && cached.ExpiresAt > now
        && !string.IsNullOrWhiteSpace(requiredKeyId)
        && cached.UnknownKeyRefreshAfter > now)
      {
        return cached.Keys;
      }

      return await RefreshSigningKeysAsync(
        normalizedIssuer,
        requiredKeyId,
        cancellationToken);
    }
    finally
    {
      issuerLock.Release();
    }
  }

  private bool TryGetCachedKeys(
    string issuer,
    string? requiredKeyId,
    out IReadOnlyCollection<SecurityKey> keys)
  {
    keys = [];

    if (!_cache.TryGetValue(issuer, out var cached)
      || cached.ExpiresAt <= DateTimeOffset.UtcNow)
    {
      return false;
    }

    if (!string.IsNullOrWhiteSpace(requiredKeyId)
      && !ContainsKeyId(cached.Keys, requiredKeyId))
    {
      return false;
    }

    keys = cached.Keys;
    return true;
  }

  private async Task<IReadOnlyCollection<SecurityKey>> RefreshSigningKeysAsync(
    string issuer,
    string? requiredKeyId,
    CancellationToken cancellationToken)
  {
    var keysJson = await _httpClientFactory.CreateClient().GetStringAsync(
      BuildKeysEndpoint(issuer),
      cancellationToken);
    var keySet = new JsonWebKeySet(keysJson);
    var keys = keySet.GetSigningKeys().ToArray();

    if (keys.Length == 0)
    {
      throw new InvalidOperationException(
        "The Okta JWKS endpoint returned no signing keys.");
    }

    var now = DateTimeOffset.UtcNow;
    var unknownKeyRefreshAfter =
      !string.IsNullOrWhiteSpace(requiredKeyId) && !ContainsKeyId(keys, requiredKeyId)
        ? now.Add(UnknownKeyRefreshCooldown)
        : DateTimeOffset.MinValue;
    var cached = new SigningKeyCacheEntry(
      now.Add(SigningKeyCacheDuration),
      unknownKeyRefreshAfter,
      keys);

    _cache[issuer] = cached;

    return cached.Keys;
  }

  private static bool ContainsKeyId(
    IReadOnlyCollection<SecurityKey> keys,
    string keyId)
  {
    return keys.Any(key => string.Equals(
      key.KeyId,
      keyId,
      StringComparison.Ordinal));
  }

  private static Uri BuildKeysEndpoint(string issuer)
  {
    var issuerUri = new Uri(issuer);
    var issuerPath = issuerUri.AbsolutePath.TrimEnd('/');

    return new Uri(
      $"{issuerUri.Scheme}://{issuerUri.Authority}{issuerPath}/v1/keys");
  }

  private sealed record SigningKeyCacheEntry(
    DateTimeOffset ExpiresAt,
    DateTimeOffset UnknownKeyRefreshAfter,
    IReadOnlyCollection<SecurityKey> Keys);
}

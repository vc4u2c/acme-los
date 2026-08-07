using System.Text;
using System.Text.Json;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.State;

namespace Acme.Los.Bff.Api.Infrastructure.Security;

public interface ISecurityInspectorService
{
  ValueTask<SecurityInspectorServerSnapshot> ReadSnapshotAsync(
    HttpRequest request,
    CancellationToken cancellationToken);
}

public sealed class SecurityInspectorService : ISecurityInspectorService
{
  private readonly IAuthSessionStore _authSessionStore;
  private readonly IHostEnvironment _environment;
  private readonly BffStateStoreOptions _stateStoreOptions;

  public SecurityInspectorService(
    IAuthSessionStore authSessionStore,
    IHostEnvironment environment,
    BffStateStoreOptions stateStoreOptions)
  {
    _authSessionStore = authSessionStore;
    _environment = environment;
    _stateStoreOptions = stateStoreOptions;
  }

  public async ValueTask<SecurityInspectorServerSnapshot> ReadSnapshotAsync(
    HttpRequest request,
    CancellationToken cancellationToken)
  {
    var authSessionCookiePayload = ReadAuthSessionCookiePayload(request);
    var storedSession = authSessionCookiePayload is null
      ? null
      : await _authSessionStore.ReadActiveAsync(
        authSessionCookiePayload.SessionId,
        cancellationToken);

    return new SecurityInspectorServerSnapshot(
      "okta",
      ResolveStateStoreMode(),
      DateTimeOffset.UtcNow.ToString("O"),
      request.Cookies
        .Select(cookie => new SecurityInspectorCookieSnapshot(
          cookie.Key,
          cookie.Value))
        .OrderBy(cookie => cookie.Key, StringComparer.Ordinal)
        .ToArray(),
      new SecurityInspectorDecodedCookiesSnapshot(
        authSessionCookiePayload,
        null),
      BuildStoredSessionSnapshot(storedSession),
      ResolveConfigurationError());
  }

  private SessionCookiePayload? ReadAuthSessionCookiePayload(HttpRequest request)
  {
    return SignedCookie.TryRead<SessionCookiePayload>(
      request.Cookies.TryGetValue(CookieNames.AuthSession, out var rawCookieValue)
        ? rawCookieValue
        : null,
      _environment);
  }

  private SecurityInspectorStoredSessionSnapshot? BuildStoredSessionSnapshot(
    StoredWebAuthSession? storedSession)
  {
    if (storedSession is null)
    {
      return null;
    }

    return new SecurityInspectorStoredSessionSnapshot(
      storedSession.SessionId,
      storedSession.CreatedAt,
      storedSession.ExpiresAt,
      storedSession.LastActivityAt,
      storedSession.IdleExpiresAt,
      storedSession.Session,
      new SecurityInspectorTokenSetSnapshot(
        new SecurityInspectorTokenSnapshot(
          storedSession.Tokens.IdToken,
          DecodeJwtClaims(storedSession.Tokens.IdToken)),
        new SecurityInspectorTokenSnapshot(
          storedSession.Tokens.AccessToken,
          DecodeJwtClaims(storedSession.Tokens.AccessToken)),
        storedSession.Tokens.RefreshToken,
        storedSession.Tokens.TokenType,
        storedSession.Tokens.Scope,
        storedSession.Tokens.ExpiresIn));
  }

  private static Dictionary<string, object?>? DecodeJwtClaims(string? token)
  {
    if (string.IsNullOrWhiteSpace(token))
    {
      return null;
    }

    var tokenParts = token.Split('.');

    if (tokenParts.Length < 2)
    {
      return null;
    }

    try
    {
      return JsonSerializer.Deserialize<Dictionary<string, object?>>(
        Encoding.UTF8.GetString(FromBase64Url(tokenParts[1])));
    }
    catch (JsonException)
    {
      return null;
    }
    catch (FormatException)
    {
      return null;
    }
  }

  private static byte[] FromBase64Url(string value)
  {
    var normalized = value.Replace('-', '+').Replace('_', '/');
    var padded = normalized.Length % 4 == 0
      ? normalized
      : $"{normalized}{new string('=', 4 - (normalized.Length % 4))}";

    return Convert.FromBase64String(padded);
  }

  private string ResolveStateStoreMode()
  {
    return _stateStoreOptions.Mode == BffStateStoreMode.Redis
      ? "redis"
      : "in-memory";
  }

  private static string? ResolveConfigurationError()
  {
    return OktaAuthOptions.TryFromEnvironment() is null
      ? "Okta auth config is not available for the BFF auth flow."
      : null;
  }
}

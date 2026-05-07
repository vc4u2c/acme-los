namespace Acme.Los.Bff.Api.Contracts;

public sealed record SecurityInspectorCookieSnapshot(
  string Key,
  string Value);

public sealed record SecurityInspectorTokenSnapshot(
  string? Raw,
  Dictionary<string, object?>? Claims);

public sealed record SecurityInspectorTokenSetSnapshot(
  SecurityInspectorTokenSnapshot IdToken,
  SecurityInspectorTokenSnapshot AccessToken,
  string? RefreshToken,
  string? TokenType = null,
  string? Scope = null,
  int? ExpiresIn = null);

public sealed record SecurityInspectorStoredSessionSnapshot(
  string SessionId,
  long CreatedAt,
  int ExpiresAt,
  int LastActivityAt,
  int IdleExpiresAt,
  WebAuthSession Session,
  SecurityInspectorTokenSetSnapshot Tokens);

public sealed record SecurityInspectorDecodedCookiesSnapshot(
  object? AuthSession,
  object? AuthTransaction);

public sealed record SecurityInspectorServerSnapshot(
  string Provider,
  string StateStoreMode,
  string GeneratedAt,
  IReadOnlyList<SecurityInspectorCookieSnapshot> RequestCookies,
  SecurityInspectorDecodedCookiesSnapshot DecodedCookies,
  SecurityInspectorStoredSessionSnapshot? StoredSession,
  string? ConfigurationError = null);

using System.Text.Json.Serialization;

namespace Acme.Los.Bff.Api.Contracts;

public sealed record WebAuthSessionUser(
    string Id,
    string DisplayName,
    string? Email = null,
    string? FirstName = null,
    string? LastName = null,
    string? LeadId = null,
    string? CustomerId = null,
    string[]? AuthenticationMethods = null);

public sealed record WebAuthSession(
    string Provider,
    string Status,
    bool IsAuthenticated,
    string AssuranceLevel,
    WebAuthSessionUser? User,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? ErrorMessage = null);

public sealed record WebAuthSessionTiming(
    int AbsoluteExpiresAt,
    int IdleExpiresAt,
    int IdleTimeoutSeconds,
    int WarningSeconds);

public sealed record WebAuthSessionDebugSnapshot(
    Dictionary<string, object?>? IdTokenClaims,
    Dictionary<string, object?>? AccessTokenClaims);

public sealed record GetWebAuthSessionResponse(
    WebAuthSession Session,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionTiming? SessionTiming = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionDebugSnapshot? Debug = null);

public sealed record SyncWebAuthSessionRequest(
    string IdToken,
    string? LeadId = null,
    Dictionary<string, object?>? AccessTokenClaims = null);

public sealed record SyncWebAuthSessionResponse(
    WebAuthSession Session,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionTiming? SessionTiming = null);

public sealed record TouchWebAuthSessionResponse(
    WebAuthSession Session,
    bool Touched,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionTiming? SessionTiming = null);

public sealed record ClearWebAuthSessionResponse(
    WebAuthSession Session,
    bool Cleared);

public sealed record IssueCsrfTokenResponse(string CsrfToken);

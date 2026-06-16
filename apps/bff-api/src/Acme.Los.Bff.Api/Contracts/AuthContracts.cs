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
    int WarningSeconds,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionStepUpTiming? StepUp = null);

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
    Dictionary<string, object?>? AccessTokenClaims = null,
    WebAuthSession? Session = null,
    int? ExpiresAt = null,
    WebAuthSessionTokenSet? ServerTokens = null,
    WebAuthStepUpRequirement? StepUp = null);

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

public sealed record WebAuthSessionTokenSet(
    string IdToken,
    string? AccessToken = null,
    string? RefreshToken = null,
    string? TokenType = null,
    string? Scope = null,
    int? ExpiresIn = null);

public sealed record WebAuthStepUpRequirement(
    string Reason,
    int MaxAgeSeconds,
    bool? ConsumeOnSatisfied = null);

public sealed record StartAuthFlowResponse(
    string AuthorizeUrl,
    string TransactionId,
    int MaxAge,
    string ReturnTo);

public sealed record CompleteAuthFlowResponse(
    WebAuthSession Session,
    string ReturnTo,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionTiming? SessionTiming = null);

public sealed record StartLogoutResponse(
    WebAuthSession Session,
    bool Cleared,
    string LogoutUrl,
    bool UsedOktaLogout);

public sealed record StoredWebAuthStepUp(
    string Reason,
    int CompletedAt,
    int ExpiresAt,
    int? ConsumedAt = null);

public sealed record WebAuthSessionStepUpTiming(
    string Reason,
    int CompletedAt,
    int ExpiresAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? ConsumedAt = null);

public sealed record RequireWebAuthSessionRequest(
    bool? RequiresAuthentication = null,
    string? MinimumAssuranceLevel = null,
    WebAuthStepUpRequirement? RequiredStepUp = null);

public sealed record RequireWebAuthSessionResponse(
    WebAuthSession Session,
    bool Satisfied,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    WebAuthSessionTiming? SessionTiming = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? ErrorMessage = null);

public sealed record GetWebAuthLogoutHintResponse(string? IdToken);

public sealed record IssueCsrfTokenResponse(string CsrfToken);

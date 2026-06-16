using System.Collections.Concurrent;
using System.Security.Cryptography;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;
using Acme.Los.Bff.Api.Infrastructure.State;

namespace Acme.Los.Bff.Api.Infrastructure.Auth;

public interface IAuthSessionService
{
  ValueTask<GetWebAuthSessionResponse> ReadSessionAsync(
    HttpRequest request,
    bool includeDebug,
    CancellationToken cancellationToken);

  ValueTask<AuthSessionMutationResult> SyncSessionAsync(
    HttpContext context,
    SyncWebAuthSessionRequest payload,
    CancellationToken cancellationToken);

  ValueTask<ClearWebAuthSessionResponse> ClearSessionAsync(
    HttpContext context,
    CancellationToken cancellationToken);

  ValueTask<AuthSessionMutationResult?> TouchSessionAsync(
    HttpRequest request,
    CancellationToken cancellationToken);

  ValueTask<bool> TryUpdateSessionCustomerIdAsync(
    HttpRequest request,
    string userId,
    string customerId,
    CancellationToken cancellationToken);

  ValueTask<RequireWebAuthSessionResponse> RequireSessionAsync(
    HttpRequest request,
    RequireWebAuthSessionRequest requirement,
    CancellationToken cancellationToken);

  ValueTask<StoredWebAuthSession?> ReadActiveStoredSessionAsync(
    HttpRequest request,
    CancellationToken cancellationToken);

  ValueTask<GetWebAuthLogoutHintResponse> ReadLogoutHintAsync(
    HttpRequest request,
    CancellationToken cancellationToken);
}

public sealed record AuthSessionMutationResult(
  string StoredSessionId,
  int MaxAge,
  object Response);

public sealed class BffAuthSessionService : IAuthSessionService
{
  private readonly IAuthSessionStore _store;
  private readonly IHostEnvironment _environment;

  public BffAuthSessionService(
    IAuthSessionStore store,
    IHostEnvironment environment)
  {
    _store = store;
    _environment = environment;
  }

  public async ValueTask<GetWebAuthSessionResponse> ReadSessionAsync(
    HttpRequest request,
    bool includeDebug,
    CancellationToken cancellationToken)
  {
    var storedSession = await ReadActiveSessionFromCookieAsync(
      request,
      cancellationToken);

    if (storedSession is null)
    {
      return new GetWebAuthSessionResponse(
        BuildUnauthenticatedSession(),
        Debug: includeDebug
          ? new WebAuthSessionDebugSnapshot(null, null)
          : null);
    }

    return new GetWebAuthSessionResponse(
      storedSession.Session,
      BuildTiming(storedSession),
      includeDebug
        ? new WebAuthSessionDebugSnapshot(null, null)
        : null);
  }

  public async ValueTask<AuthSessionMutationResult> SyncSessionAsync(
    HttpContext context,
    SyncWebAuthSessionRequest payload,
    CancellationToken cancellationToken)
  {
    if (payload.Session is null || payload.ExpiresAt is null)
    {
      throw new InvalidOperationException(
        "The BFF session authority requires a preverified session payload from the Next facade.");
    }

    var tokens = payload.ServerTokens ?? new WebAuthSessionTokenSet(payload.IdToken);
    var currentEpochSeconds = GetCurrentEpochSeconds();
    var expiresAt = ResolveAbsoluteSessionExpiresAt(
      payload.ExpiresAt.Value,
      currentEpochSeconds);
    var sessionId = CreateRandomToken();
    var storedSession = new StoredWebAuthSession(
      sessionId,
      payload.Session,
      tokens with { IdToken = payload.IdToken },
      expiresAt,
      DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
      currentEpochSeconds,
      Math.Min(expiresAt, currentEpochSeconds + GetTimeoutConfig().IdleTimeoutSeconds),
      payload.StepUp is null
        ? null
        : new StoredWebAuthStepUp(
          payload.StepUp.Reason,
          currentEpochSeconds,
          currentEpochSeconds + payload.StepUp.MaxAgeSeconds));

    var currentSessionId = TryReadSessionId(context.Request);
    if (!string.IsNullOrWhiteSpace(currentSessionId)
      && !string.Equals(currentSessionId, sessionId, StringComparison.Ordinal))
    {
      await _store.DeleteAsync(currentSessionId, cancellationToken);
    }

    await _store.WriteAsync(storedSession, cancellationToken);

    return new AuthSessionMutationResult(
      storedSession.SessionId,
      GetSessionCookieMaxAge(storedSession),
      new SyncWebAuthSessionResponse(
        storedSession.Session,
        BuildTiming(storedSession)));
  }

  public async ValueTask<ClearWebAuthSessionResponse> ClearSessionAsync(
    HttpContext context,
    CancellationToken cancellationToken)
  {
    var sessionId = TryReadSessionId(context.Request);

    if (!string.IsNullOrWhiteSpace(sessionId))
    {
      await _store.DeleteAsync(sessionId, cancellationToken);
    }

    context.Response.Cookies.Delete(
      CookieNames.AuthSession,
      BuildCookieOptions(context.Request));

    return new ClearWebAuthSessionResponse(
      BuildUnauthenticatedSession(),
      true);
  }

  public async ValueTask<AuthSessionMutationResult?> TouchSessionAsync(
    HttpRequest request,
    CancellationToken cancellationToken)
  {
    var sessionId = TryReadSessionId(request);

    if (string.IsNullOrWhiteSpace(sessionId))
    {
      return null;
    }

    var storedSession = await _store.ReadActiveAsync(sessionId, cancellationToken);

    if (storedSession is null)
    {
      return null;
    }

    var currentEpochSeconds = GetCurrentEpochSeconds();
    var touchedSession = storedSession with
    {
      LastActivityAt = currentEpochSeconds,
      IdleExpiresAt = Math.Min(
        storedSession.ExpiresAt,
        currentEpochSeconds + GetTimeoutConfig().IdleTimeoutSeconds),
    };

    await _store.WriteAsync(touchedSession, cancellationToken);

    return new AuthSessionMutationResult(
      touchedSession.SessionId,
      GetSessionCookieMaxAge(touchedSession),
      new TouchWebAuthSessionResponse(
        touchedSession.Session,
        true,
        BuildTiming(touchedSession)));
  }

  public async ValueTask<bool> TryUpdateSessionCustomerIdAsync(
    HttpRequest request,
    string userId,
    string customerId,
    CancellationToken cancellationToken)
  {
    if (string.IsNullOrWhiteSpace(userId)
      || string.IsNullOrWhiteSpace(customerId))
    {
      return false;
    }

    var sessionId = TryReadSessionId(request);

    if (string.IsNullOrWhiteSpace(sessionId))
    {
      return false;
    }

    var storedSession = await _store.ReadActiveAsync(sessionId, cancellationToken);
    var sessionUser = storedSession?.Session.User;

    if (storedSession is null
      || sessionUser is null
      || !storedSession.Session.IsAuthenticated
      || !string.Equals(sessionUser.Id, userId, StringComparison.Ordinal))
    {
      return false;
    }

    if (!string.IsNullOrWhiteSpace(sessionUser.CustomerId))
    {
      return true;
    }

    var nextSession = storedSession.Session with
    {
      User = sessionUser with
      {
        CustomerId = customerId.Trim(),
      },
    };
    var nextStoredSession = storedSession with
    {
      Session = nextSession,
    };

    await _store.WriteAsync(nextStoredSession, cancellationToken);

    return true;
  }

  public async ValueTask<RequireWebAuthSessionResponse> RequireSessionAsync(
    HttpRequest request,
    RequireWebAuthSessionRequest requirement,
    CancellationToken cancellationToken)
  {
    var storedSession = await ReadActiveSessionFromCookieAsync(
      request,
      cancellationToken);
    var session = storedSession?.Session ?? BuildUnauthenticatedSession();

    if (requirement.RequiresAuthentication != false)
    {
      if (!session.IsAuthenticated || session.User is null)
      {
        return BuildUnsatisfiedRequirementResponse(
          session,
          storedSession,
          "Authentication is required for this request.");
      }

      var minimumAssuranceLevel = string.IsNullOrWhiteSpace(
          requirement.MinimumAssuranceLevel)
        ? "aal1"
        : requirement.MinimumAssuranceLevel;

      if (!IsAssuranceSatisfied(session.AssuranceLevel, minimumAssuranceLevel))
      {
        return BuildUnsatisfiedRequirementResponse(
          session,
          storedSession,
          "Step-up MFA is required for this request.");
      }

      if (requirement.RequiredStepUp is not null
        && !IsStepUpFresh(storedSession, requirement.RequiredStepUp))
      {
        return BuildUnsatisfiedRequirementResponse(
          session,
          storedSession,
          "Fresh step-up MFA is required for this request.");
      }
    }

    if (storedSession is not null
      && requirement.RequiredStepUp?.ConsumeOnSatisfied == true
      && storedSession.StepUp is not null)
    {
      var nextStoredSession = storedSession with
      {
        StepUp = storedSession.StepUp with
        {
          ConsumedAt = GetCurrentEpochSeconds(),
        },
      };

      await _store.WriteAsync(nextStoredSession, cancellationToken);
      storedSession = nextStoredSession;
    }

    return new RequireWebAuthSessionResponse(
      session,
      true,
      storedSession is null ? null : BuildTiming(storedSession));
  }

  public async ValueTask<GetWebAuthLogoutHintResponse> ReadLogoutHintAsync(
    HttpRequest request,
    CancellationToken cancellationToken)
  {
    var sessionId = TryReadSessionId(request);

    if (string.IsNullOrWhiteSpace(sessionId))
    {
      return new GetWebAuthLogoutHintResponse(null);
    }

    var storedSession = await _store.ReadForLogoutAsync(sessionId, cancellationToken);

    return new GetWebAuthLogoutHintResponse(storedSession?.Tokens.IdToken);
  }

  public static WebAuthSession BuildUnauthenticatedSession(
    string? errorMessage = null)
  {
    return new WebAuthSession(
      "okta",
      errorMessage is null ? "unauthenticated" : "error",
      false,
      "anonymous",
      null,
      errorMessage);
  }

  private async ValueTask<StoredWebAuthSession?> ReadActiveSessionFromCookieAsync(
    HttpRequest request,
    CancellationToken cancellationToken)
  {
    var sessionId = TryReadSessionId(request);

    return string.IsNullOrWhiteSpace(sessionId)
      ? null
      : await _store.ReadActiveAsync(sessionId, cancellationToken);
  }

  private string? TryReadSessionId(HttpRequest request)
  {
    if (!request.Cookies.TryGetValue(CookieNames.AuthSession, out var rawCookieValue))
    {
      return null;
    }

    var payload = SignedCookie.TryRead<SessionCookiePayload>(
      rawCookieValue,
      _environment);

    return string.IsNullOrWhiteSpace(payload?.SessionId)
      ? null
      : payload.SessionId;
  }

  private static RequireWebAuthSessionResponse BuildUnsatisfiedRequirementResponse(
    WebAuthSession session,
    StoredWebAuthSession? storedSession,
    string message)
  {
    return new RequireWebAuthSessionResponse(
      session,
      false,
      storedSession is null ? null : BuildTiming(storedSession),
      message);
  }

  private static bool IsStepUpFresh(
    StoredWebAuthSession? storedSession,
    WebAuthStepUpRequirement requirement)
  {
    var stepUp = storedSession?.StepUp;

    if (stepUp is null
      || !string.Equals(stepUp.Reason, requirement.Reason, StringComparison.Ordinal))
    {
      return false;
    }

    if (stepUp.ExpiresAt <= GetCurrentEpochSeconds())
    {
      return false;
    }

    if (requirement.ConsumeOnSatisfied == true
      && stepUp.ConsumedAt is not null
      && stepUp.ConsumedAt >= stepUp.CompletedAt)
    {
      return false;
    }

    return true;
  }

  private static bool IsAssuranceSatisfied(
    string actualAssuranceLevel,
    string requiredAssuranceLevel)
  {
    return ToAssuranceRank(actualAssuranceLevel) >= ToAssuranceRank(requiredAssuranceLevel);
  }

  private static int ToAssuranceRank(string assuranceLevel)
  {
    return assuranceLevel switch
    {
      "aal2" => 2,
      "aal1" => 1,
      _ => 0,
    };
  }

  private static CookieOptions BuildCookieOptions(HttpRequest request)
  {
    return new CookieOptions
    {
      HttpOnly = true,
      Path = "/",
      SameSite = SameSiteMode.Lax,
      Secure = BffRequestSecurity.IsSecureRequest(request),
    };
  }

  private static int GetCurrentEpochSeconds()
  {
    return (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  }

  private static int ResolveAbsoluteSessionExpiresAt(
    int tokenExpiresAt,
    int currentEpochSeconds)
  {
    var absoluteTimeoutSeconds = GetTimeoutConfig().AbsoluteTimeoutSeconds;

    return absoluteTimeoutSeconds is null
      ? tokenExpiresAt
      : Math.Min(tokenExpiresAt, currentEpochSeconds + absoluteTimeoutSeconds.Value);
  }

  private static WebAuthSessionTiming BuildTiming(StoredWebAuthSession storedSession)
  {
    var timeoutConfig = GetTimeoutConfig();

    return new WebAuthSessionTiming(
      storedSession.ExpiresAt,
      storedSession.IdleExpiresAt,
      timeoutConfig.IdleTimeoutSeconds,
      timeoutConfig.WarningSeconds,
      storedSession.StepUp is null
        ? null
        : new WebAuthSessionStepUpTiming(
          storedSession.StepUp.Reason,
          storedSession.StepUp.CompletedAt,
          storedSession.StepUp.ExpiresAt,
          storedSession.StepUp.ConsumedAt));
  }

  public ValueTask<StoredWebAuthSession?> ReadActiveStoredSessionAsync(
    HttpRequest request,
    CancellationToken cancellationToken)
  {
    return ReadActiveSessionFromCookieAsync(request, cancellationToken);
  }

  private static WebSessionTimeoutConfig GetTimeoutConfig()
  {
    var isTestFriendlyEnvironment = IsTestFriendlyEnvironment();
    var defaultIdleTimeoutSeconds = isTestFriendlyEnvironment
      ? 2 * 60
      : 15 * 60;
    var defaultWarningSeconds = isTestFriendlyEnvironment
      ? 30
      : 2 * 60;
    var idleTimeoutSeconds = ReadIntegerEnvironmentValue(
      "ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS",
      1) ?? defaultIdleTimeoutSeconds;
    var warningSeconds = Math.Min(
      ReadIntegerEnvironmentValue("ACME_WEB_SESSION_WARNING_SECONDS", 0)
        ?? defaultWarningSeconds,
      Math.Max(idleTimeoutSeconds - 1, 0));

    return new WebSessionTimeoutConfig(
      idleTimeoutSeconds,
      warningSeconds,
      ReadIntegerEnvironmentValue(
        "ACME_WEB_SESSION_ABSOLUTE_TIMEOUT_SECONDS",
        1));
  }

  private static bool IsTestFriendlyEnvironment()
  {
    var environmentName =
      Environment.GetEnvironmentVariable("APP_ENVIRONMENT_NAME")?.Trim().ToLowerInvariant()
      ?? Environment.GetEnvironmentVariable("NEXT_PUBLIC_APP_ENVIRONMENT")?.Trim().ToLowerInvariant()
      ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Trim().ToLowerInvariant()
      ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")?.Trim().ToLowerInvariant()
      ?? string.Empty;

    return environmentName is "local" or "dev" or "development";
  }

  private static int? ReadIntegerEnvironmentValue(
    string name,
    int minimum)
  {
    var rawValue = Environment.GetEnvironmentVariable(name)?.Trim();

    if (string.IsNullOrWhiteSpace(rawValue))
    {
      return null;
    }

    if (int.TryParse(rawValue, out var value) && value >= minimum)
    {
      return value;
    }

    throw new InvalidOperationException(
      $"{name} must be an integer greater than or equal to {minimum}.");
  }

  private static int GetSessionCookieMaxAge(StoredWebAuthSession storedSession)
  {
    return GetSessionRetentionTtlSeconds(storedSession);
  }

  private static int GetSessionRetentionTtlSeconds(StoredWebAuthSession storedSession)
  {
    var retainedUntil =
      Math.Min(storedSession.ExpiresAt, storedSession.IdleExpiresAt) + 5 * 60;

    return Math.Max(retainedUntil - GetCurrentEpochSeconds(), 1);
  }

  private static string CreateRandomToken()
  {
    return ToBase64Url(RandomNumberGenerator.GetBytes(32));
  }

  private static string ToBase64Url(byte[] value)
  {
    return Convert.ToBase64String(value)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }

  private sealed record WebSessionTimeoutConfig(
    int IdleTimeoutSeconds,
    int WarningSeconds,
    int? AbsoluteTimeoutSeconds);
}

public interface IAuthSessionStore
{
  ValueTask<StoredWebAuthSession?> ReadActiveAsync(
    string sessionId,
    CancellationToken cancellationToken);

  ValueTask<StoredWebAuthSession?> ReadForLogoutAsync(
    string sessionId,
    CancellationToken cancellationToken);

  ValueTask WriteAsync(
    StoredWebAuthSession storedSession,
    CancellationToken cancellationToken);

  ValueTask DeleteAsync(
    string sessionId,
    CancellationToken cancellationToken);
}

public sealed record StoredWebAuthSession(
  string SessionId,
  WebAuthSession Session,
  WebAuthSessionTokenSet Tokens,
  int ExpiresAt,
  long CreatedAt,
  int LastActivityAt,
  int IdleExpiresAt,
  StoredWebAuthStepUp? StepUp = null);

internal sealed class InMemoryAuthSessionStore : IAuthSessionStore
{
  private readonly ConcurrentDictionary<string, StoredWebAuthSession> _sessions = new();

  public ValueTask<StoredWebAuthSession?> ReadActiveAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    if (!_sessions.TryGetValue(sessionId, out var storedSession))
    {
      return ValueTask.FromResult<StoredWebAuthSession?>(null);
    }

    if (IsExpired(storedSession))
    {
      _sessions.TryRemove(sessionId, out _);
      return ValueTask.FromResult<StoredWebAuthSession?>(null);
    }

    return ValueTask.FromResult<StoredWebAuthSession?>(storedSession);
  }

  public ValueTask<StoredWebAuthSession?> ReadForLogoutAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    return ValueTask.FromResult(
      _sessions.TryGetValue(sessionId, out var storedSession)
        ? storedSession
        : null);
  }

  public ValueTask WriteAsync(
    StoredWebAuthSession storedSession,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    _sessions[storedSession.SessionId] = storedSession;

    return ValueTask.CompletedTask;
  }

  public ValueTask DeleteAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    _sessions.TryRemove(sessionId, out _);

    return ValueTask.CompletedTask;
  }

  private static bool IsExpired(StoredWebAuthSession storedSession)
  {
    var currentEpochSeconds = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    return storedSession.ExpiresAt <= currentEpochSeconds
      || storedSession.IdleExpiresAt <= currentEpochSeconds;
  }
}

internal sealed class RedisAuthSessionStore : IAuthSessionStore
{
  private const string Namespace = "auth-session";

  private readonly RedisStateStore _stateStore;

  public RedisAuthSessionStore(RedisStateStore stateStore)
  {
    _stateStore = stateStore;
  }

  public async ValueTask<StoredWebAuthSession?> ReadActiveAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    var storedSession = await _stateStore.ReadAsync<StoredWebAuthSession>(
      Namespace,
      sessionId,
      cancellationToken);

    if (storedSession is null)
    {
      return null;
    }

    var currentEpochSeconds = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    if (storedSession.ExpiresAt <= currentEpochSeconds
      || storedSession.IdleExpiresAt <= currentEpochSeconds)
    {
      await DeleteAsync(sessionId, cancellationToken);
      return null;
    }

    return storedSession;
  }

  public ValueTask<StoredWebAuthSession?> ReadForLogoutAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    return _stateStore.ReadAsync<StoredWebAuthSession>(
      Namespace,
      sessionId,
      cancellationToken);
  }

  public ValueTask WriteAsync(
    StoredWebAuthSession storedSession,
    CancellationToken cancellationToken)
  {
    return _stateStore.WriteAsync(
      Namespace,
      storedSession.SessionId,
      storedSession,
      TimeSpan.FromSeconds(GetSessionRetentionTtlSeconds(storedSession)),
      cancellationToken);
  }

  public ValueTask DeleteAsync(
    string sessionId,
    CancellationToken cancellationToken)
  {
    return _stateStore.DeleteAsync(Namespace, sessionId, cancellationToken);
  }

  private static int GetSessionRetentionTtlSeconds(StoredWebAuthSession storedSession)
  {
    var currentEpochSeconds = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var retainedUntil =
      Math.Min(storedSession.ExpiresAt, storedSession.IdleExpiresAt) + 5 * 60;

    return Math.Max(retainedUntil - currentEpochSeconds, 1);
  }
}

internal sealed record SessionCookiePayload(string SessionId);

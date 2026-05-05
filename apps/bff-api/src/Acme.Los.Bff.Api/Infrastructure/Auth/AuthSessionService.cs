using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Infrastructure.Auth;

public interface IAuthSessionService
{
  GetWebAuthSessionResponse ReadSession(bool includeDebug);
  TouchWebAuthSessionResponse? TouchSession(HttpRequest request);
  ClearWebAuthSessionResponse ClearSession(HttpContext context);
  SyncWebAuthSessionResponse SyncSession(SyncWebAuthSessionRequest payload);
}

public sealed class BootstrapAuthSessionService : IAuthSessionService
{
  public GetWebAuthSessionResponse ReadSession(bool includeDebug)
  {
    return new GetWebAuthSessionResponse(
        BuildUnauthenticatedSession(),
        Debug: includeDebug
            ? new WebAuthSessionDebugSnapshot(null, null)
            : null);
  }

  public TouchWebAuthSessionResponse? TouchSession(HttpRequest request)
  {
    return request.Cookies.ContainsKey(CookieNames.AuthSession)
        ? new TouchWebAuthSessionResponse(
            BuildUnauthenticatedSession("The auth session is no longer active."),
            false)
        : null;
  }

  public ClearWebAuthSessionResponse ClearSession(HttpContext context)
  {
    context.Response.Cookies.Delete(
        CookieNames.AuthSession,
        BuildCookieOptions(context.Request));

    return new ClearWebAuthSessionResponse(
        BuildUnauthenticatedSession(),
        true);
  }

  public SyncWebAuthSessionResponse SyncSession(
      SyncWebAuthSessionRequest payload)
  {
    throw new NotSupportedException(
        "BFF auth session sync is not enabled yet.");
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

  private static CookieOptions BuildCookieOptions(HttpRequest request)
  {
    return new CookieOptions
    {
      HttpOnly = true,
      Path = "/",
      SameSite = SameSiteMode.Lax,
      Secure = request.IsHttps,
    };
  }
}

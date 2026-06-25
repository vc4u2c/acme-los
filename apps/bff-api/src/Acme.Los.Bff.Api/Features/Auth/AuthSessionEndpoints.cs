using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Infrastructure.Auth;

namespace Acme.Los.Bff.Api.Features.Auth;

public static class AuthSessionEndpoints
{
  private const string AuthSessionIdHeaderName = "x-acme-auth-session-id";
  private const string AuthSessionMaxAgeHeaderName = "x-acme-auth-session-max-age";

  public static IEndpointRouteBuilder MapBffAuthSessionEndpoints(
      this IEndpointRouteBuilder endpoints)
  {
    var authGroup = endpoints.MapGroup("/bff/auth");

    authGroup.MapGet(
            "/session",
            async (
                HttpRequest request,
                IAuthSessionService authSessionService,
                CancellationToken cancellationToken) =>
            {
              if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(request))
              {
                return BffTrustedProxyBoundary.BuildRejectedResult();
              }

              var includeDebug = string.Equals(
                      request.Query["includeDebug"],
                      "1",
                      StringComparison.Ordinal);

              return Results.Json(
                      await authSessionService.ReadSessionAsync(
                        request,
                        includeDebug,
                        cancellationToken));
            })
        .WithName("GetBffAuthSession")
        .Produces<GetWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapDelete(
            "/session",
            async (
                HttpContext context,
                IAuthSessionService authSessionService) =>
            {
              try
              {
                if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
                {
                  return BffTrustedProxyBoundary.BuildRejectedResult();
                }

                return Results.Json(await authSessionService.ClearSessionAsync(
                  context,
                  context.RequestAborted));
              }
              catch (Exception error)
              {
                return Results.Json(
                        new ClearWebAuthSessionResponse(
                            BffAuthSessionService.BuildUnauthenticatedSession(
                                error.Message),
                            false),
                        statusCode: StatusCodes.Status400BadRequest);
              }
            })
        .WithName("ClearBffAuthSession")
        .Produces<ClearWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces<ClearWebAuthSessionResponse>(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapPost(
            "/session/touch",
            async (
                HttpContext context,
                IAuthSessionService authSessionService) =>
            {
              try
              {
                if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
                {
                  return BffTrustedProxyBoundary.BuildRejectedResult();
                }

                var touchedSession = await authSessionService.TouchSessionAsync(
                  context.Request,
                  context.RequestAborted);

                if (touchedSession is not null)
                {
                  WriteAuthSessionHeaders(context, touchedSession);
                }

                return touchedSession is null
                        ? Results.Json(
                            BuildTouchErrorResponse(
                                "The auth session is no longer active."),
                            statusCode: StatusCodes.Status401Unauthorized)
                        : Results.Json(touchedSession.Response);
              }
              catch (Exception error)
              {
                return Results.Json(
                        BuildTouchErrorResponse(error.Message),
                        statusCode: StatusCodes.Status400BadRequest);
              }
            })
        .WithName("TouchBffAuthSession")
        .Produces<TouchWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces<TouchWebAuthSessionResponse>(
            StatusCodes.Status400BadRequest)
        .Produces<TouchWebAuthSessionResponse>(
            StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapPost(
            "/session/requirement",
            async (
                HttpContext context,
                RequireWebAuthSessionRequest? payload,
                IAuthSessionService authSessionService) =>
            {
              if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
              {
                return BffTrustedProxyBoundary.BuildRejectedResult();
              }

              return Results.Json(await authSessionService.RequireSessionAsync(
                context.Request,
                payload ?? new RequireWebAuthSessionRequest(),
                context.RequestAborted));
            })
        .WithName("RequireBffAuthSession")
        .Produces<RequireWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapGet(
            "/logout-hint",
            async (
                HttpContext context,
                IAuthSessionService authSessionService) =>
            {
              if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
              {
                return BffTrustedProxyBoundary.BuildRejectedResult();
              }

              return Results.Json(await authSessionService.ReadLogoutHintAsync(
                context.Request,
                context.RequestAborted));
            })
        .WithName("GetBffAuthLogoutHint")
        .Produces<GetWebAuthLogoutHintResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status403Forbidden);

    return endpoints;
  }

  private static TouchWebAuthSessionResponse BuildTouchErrorResponse(
      string message)
  {
    return new TouchWebAuthSessionResponse(
        BffAuthSessionService.BuildUnauthenticatedSession(message),
        false);
  }

  private static void WriteAuthSessionHeaders(
    HttpContext context,
    AuthSessionMutationResult result)
  {
    context.Response.Headers[AuthSessionIdHeaderName] = result.StoredSessionId;
    context.Response.Headers[AuthSessionMaxAgeHeaderName] =
      result.MaxAge.ToString(System.Globalization.CultureInfo.InvariantCulture);
  }
}

using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.Auth;

public static class AuthSessionEndpoints
{
  public static IEndpointRouteBuilder MapBffAuthSessionEndpoints(
      this IEndpointRouteBuilder endpoints)
  {
    var authGroup = endpoints.MapGroup("/bff/auth");

    authGroup.MapGet(
            "/session",
            (HttpRequest request, IAuthSessionService authSessionService) =>
            {
              var includeDebug = string.Equals(
                      request.Query["includeDebug"],
                      "1",
                      StringComparison.Ordinal);

              return Results.Json(
                      authSessionService.ReadSession(includeDebug));
            })
        .WithName("GetBffAuthSession")
        .Produces<GetWebAuthSessionResponse>(StatusCodes.Status200OK);

    authGroup.MapPost(
            "/session",
            async (
                HttpContext context,
                IAuthSessionService authSessionService,
                ICsrfTokenService csrfTokenService) =>
            {
              try
              {
                csrfTokenService.ValidateRequest(context.Request);

                var payload =
                        await context.Request.ReadFromJsonAsync<SyncWebAuthSessionRequest>(
                            cancellationToken: context.RequestAborted);

                if (payload is null || string.IsNullOrWhiteSpace(payload.IdToken))
                {
                  return Results.Json(
                          BuildSyncErrorResponse("Unable to sync auth session."),
                          statusCode: StatusCodes.Status400BadRequest);
                }

                return Results.Json(authSessionService.SyncSession(payload));
              }
              catch (NotSupportedException error)
              {
                return Results.Json(
                        BuildSyncErrorResponse(error.Message),
                        statusCode: StatusCodes.Status501NotImplemented);
              }
              catch (Exception error)
              {
                return Results.Json(
                        BuildSyncErrorResponse(error.Message),
                        statusCode: StatusCodes.Status400BadRequest);
              }
            })
        .WithName("SyncBffAuthSession")
        .Produces<SyncWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces<SyncWebAuthSessionResponse>(StatusCodes.Status400BadRequest)
        .Produces<SyncWebAuthSessionResponse>(
            StatusCodes.Status501NotImplemented);

    authGroup.MapDelete(
            "/session",
            (
                HttpContext context,
                IAuthSessionService authSessionService,
                ICsrfTokenService csrfTokenService) =>
            {
              try
              {
                csrfTokenService.ValidateRequest(context.Request);

                return Results.Json(authSessionService.ClearSession(context));
              }
              catch (Exception error)
              {
                return Results.Json(
                        new ClearWebAuthSessionResponse(
                            BootstrapAuthSessionService.BuildUnauthenticatedSession(
                                error.Message),
                            false),
                        statusCode: StatusCodes.Status400BadRequest);
              }
            })
        .WithName("ClearBffAuthSession")
        .Produces<ClearWebAuthSessionResponse>(StatusCodes.Status200OK)
        .Produces<ClearWebAuthSessionResponse>(StatusCodes.Status400BadRequest);

    authGroup.MapPost(
            "/session/touch",
            (
                HttpContext context,
                IAuthSessionService authSessionService,
                ICsrfTokenService csrfTokenService) =>
            {
              try
              {
                csrfTokenService.ValidateRequest(context.Request);

                var touchedSession = authSessionService.TouchSession(
                        context.Request);

                return touchedSession is null
                        ? Results.Json(
                            BuildTouchErrorResponse(
                                "The auth session is no longer active."),
                            statusCode: StatusCodes.Status401Unauthorized)
                        : Results.Json(touchedSession);
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
            StatusCodes.Status401Unauthorized);

    return endpoints;
  }

  private static SyncWebAuthSessionResponse BuildSyncErrorResponse(
      string message)
  {
    return new SyncWebAuthSessionResponse(
        BootstrapAuthSessionService.BuildUnauthenticatedSession(message));
  }

  private static TouchWebAuthSessionResponse BuildTouchErrorResponse(
      string message)
  {
    return new TouchWebAuthSessionResponse(
        BootstrapAuthSessionService.BuildUnauthenticatedSession(message),
        false);
  }
}

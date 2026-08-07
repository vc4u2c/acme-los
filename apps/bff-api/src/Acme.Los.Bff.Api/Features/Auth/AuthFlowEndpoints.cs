using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;

namespace Acme.Los.Bff.Api.Features.Auth;

public static class AuthFlowEndpoints
{
  private const string AuthSessionIdHeaderName = "x-acme-auth-session-id";
  private const string AuthSessionMaxAgeHeaderName = "x-acme-auth-session-max-age";

  public static IEndpointRouteBuilder MapBffAuthFlowEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    var authGroup = endpoints.MapGroup("/bff/auth");

    authGroup.MapPost(
        "/idx/start",
        async (
          HttpContext context,
          StartIdxAuthFlowRequest? payload,
          IAuthFlowService authFlowService) =>
        {
          try
          {
            if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
            {
              return BffTrustedProxyBoundary.BuildRejectedResult();
            }

            payload ??= new StartIdxAuthFlowRequest();

            return Results.Json(await authFlowService.StartIdxLoginAsync(
              new StartAuthFlowParameters(
                payload.ReturnTo,
                payload.MinimumAssuranceLevel,
                payload.ExpectedUserId,
                payload.LeadId,
                payload.StepUp),
              context.RequestAborted));
          }
          catch (Exception error)
          {
            return Results.Json(
              new { error = error.Message },
              statusCode: StatusCodes.Status400BadRequest);
          }
        })
      .WithName("StartBffIdxLogin")
      .Produces<StartIdxAuthFlowResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapPost(
        "/idx/complete",
        async (
          HttpContext context,
          CompleteIdxAuthFlowRequest? payload,
          IAuthFlowService authFlowService) =>
        {
          try
          {
            if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
            {
              return BffTrustedProxyBoundary.BuildRejectedResult();
            }

            if (payload is null
              || string.IsNullOrWhiteSpace(payload.InteractionCode)
              || string.IsNullOrWhiteSpace(payload.State))
            {
              return Results.Json(
                new { error = "The IDX completion did not include the expected interaction code and state." },
                statusCode: StatusCodes.Status400BadRequest);
            }

            var syncedSession = await authFlowService.CompleteIdxAsync(
              context,
              payload.InteractionCode,
              payload.State,
              context.RequestAborted);

            WriteAuthSessionHeaders(context, syncedSession);

            return Results.Json(syncedSession.Response);
          }
          catch (Exception error)
          {
            return Results.Json(
              new { error = error.Message },
              statusCode: StatusCodes.Status400BadRequest);
          }
        })
      .WithName("CompleteBffIdxLogin")
      .Produces<CompleteAuthFlowResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapPost(
        "/logout",
        async (
          HttpContext context,
          StartLogoutRequest? payload,
          IAuthFlowService authFlowService) =>
        {
          try
          {
            if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
            {
              return BffTrustedProxyBoundary.BuildRejectedResult();
            }

            return Results.Json(await authFlowService.StartLogoutAsync(
              context,
              payload?.PostLogoutRedirectUri,
              context.RequestAborted));
          }
          catch (Exception error)
          {
            return Results.Json(
              new { error = error.Message },
              statusCode: StatusCodes.Status400BadRequest);
          }
        })
      .WithName("StartBffLogout")
      .Produces<StartLogoutResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    return endpoints;
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

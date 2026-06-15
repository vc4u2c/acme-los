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

    authGroup.MapGet(
        "/login",
        async (
          HttpContext context,
          IAuthFlowService authFlowService) =>
        {
          try
          {
            if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
            {
              return BffTrustedProxyBoundary.BuildRejectedResult();
            }

            return Results.Json(await authFlowService.StartLoginAsync(
              context.Request,
              ReadStartAuthFlowParameters(context.Request),
              context.RequestAborted));
          }
          catch (Exception error)
          {
            return Results.Json(
              new { error = error.Message },
              statusCode: StatusCodes.Status400BadRequest);
          }
        })
      .WithName("StartBffLogin")
      .Produces<StartAuthFlowResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapGet(
        "/callback",
        async (
          HttpContext context,
          IAuthFlowService authFlowService) =>
        {
          try
          {
            if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
            {
              return BffTrustedProxyBoundary.BuildRejectedResult();
            }

            var error = context.Request.Query["error_description"].ToString();

            if (string.IsNullOrWhiteSpace(error))
            {
              error = context.Request.Query["error"].ToString();
            }

            if (!string.IsNullOrWhiteSpace(error))
            {
              return Results.Json(
                new { error },
                statusCode: StatusCodes.Status400BadRequest);
            }

            var code = context.Request.Query["code"].ToString();
            var state = context.Request.Query["state"].ToString();

            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
            {
              return Results.Json(
                new { error = "The Okta callback did not include the expected code and state." },
                statusCode: StatusCodes.Status400BadRequest);
            }

            var syncedSession = await authFlowService.CompleteCallbackAsync(
              context,
              code,
              state,
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
      .WithName("CompleteBffLoginCallback")
      .Produces<CompleteAuthFlowResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    authGroup.MapPost(
        "/logout",
        async (
          HttpContext context,
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

  private static StartAuthFlowParameters ReadStartAuthFlowParameters(
    HttpRequest request)
  {
    var minimumAssuranceLevel = request.Query["aal"].ToString();
    var stepUpReason = request.Query["stepUpReason"].ToString();
    var rawStepUpMaxAgeSeconds = request.Query["stepUpMaxAgeSeconds"].ToString();
    var stepUp = !string.IsNullOrWhiteSpace(stepUpReason)
      && int.TryParse(rawStepUpMaxAgeSeconds, out var stepUpMaxAgeSeconds)
      && stepUpMaxAgeSeconds > 0
        ? new WebAuthStepUpRequirement(
          stepUpReason,
          stepUpMaxAgeSeconds,
          string.Equals(
            request.Query["stepUpConsumeOnSatisfied"].ToString(),
            "true",
            StringComparison.OrdinalIgnoreCase))
        : null;

    return new StartAuthFlowParameters(
      request.Query["returnTo"].ToString(),
      string.IsNullOrWhiteSpace(minimumAssuranceLevel)
        ? null
        : minimumAssuranceLevel,
      request.Query["expectedUserId"].ToString(),
      request.Query["leadId"].ToString(),
      stepUp,
      request.Query["widgetFlow"].ToString());
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

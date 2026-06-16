using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.AccountSecurity;

public static class AccountSecurityEndpoints
{
  private const int AccountSecurityStepUpMaxAgeSeconds = 10 * 60;

  public static IEndpointRouteBuilder MapBffAccountSecurityEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    var accountGroup = endpoints.MapGroup("/bff/account/security");

    accountGroup.MapPost(
        "/email",
        async (
          HttpRequest request,
          StartEmailChangeRequest? payload,
          ICsrfTokenService csrfTokenService,
          IAuthSessionService authSessionService,
          IOktaMyAccountService oktaMyAccountService,
          ILoggerFactory loggerFactory,
          CancellationToken cancellationToken) =>
        {
          var logger = CreateLogger(loggerFactory);
          LogRequested(logger, "email.start", request.Path);

          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-email",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            LogDenied(logger, "email.start", request.Path);
            return accessTokenResult.Error;
          }

          try
          {
            var response = await oktaMyAccountService.StartEmailChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken);

            LogCompleted(logger, "email.start", request.Path, response.Status);
            return Results.Ok(response);
          }
          catch (OktaMyAccountException exception)
          {
            LogFailed(logger, "email.start", request.Path, exception);
            return BuildOktaError(exception);
          }
        })
      .WithName("StartBffAccountEmailChange")
      .Produces<StartEmailChangeResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized)
      .Produces(StatusCodes.Status403Forbidden);

    accountGroup.MapPost(
        "/email/verify",
        async (
          HttpRequest request,
          VerifyEmailChangeRequest? payload,
          ICsrfTokenService csrfTokenService,
          IAuthSessionService authSessionService,
          IOktaMyAccountService oktaMyAccountService,
          ILoggerFactory loggerFactory,
          CancellationToken cancellationToken) =>
        {
          var logger = CreateLogger(loggerFactory);
          LogRequested(logger, "email.verify", request.Path);

          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-email",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            LogDenied(logger, "email.verify", request.Path);
            return accessTokenResult.Error;
          }

          try
          {
            var response = await oktaMyAccountService.VerifyEmailChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken);

            LogCompleted(logger, "email.verify", request.Path, response.Status);
            return Results.Ok(response);
          }
          catch (OktaMyAccountException exception)
          {
            LogFailed(logger, "email.verify", request.Path, exception);
            return BuildOktaError(exception);
          }
        })
      .WithName("VerifyBffAccountEmailChange")
      .Produces<VerifyEmailChangeResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized)
      .Produces(StatusCodes.Status403Forbidden);

    accountGroup.MapPost(
        "/phone",
        async (
          HttpRequest request,
          StartPhoneChangeRequest? payload,
          ICsrfTokenService csrfTokenService,
          IAuthSessionService authSessionService,
          IOktaMyAccountService oktaMyAccountService,
          ILoggerFactory loggerFactory,
          CancellationToken cancellationToken) =>
        {
          var logger = CreateLogger(loggerFactory);
          LogRequested(logger, "phone.start", request.Path);

          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-phone",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            LogDenied(logger, "phone.start", request.Path);
            return accessTokenResult.Error;
          }

          try
          {
            var response = await oktaMyAccountService.StartPhoneChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken);

            LogCompleted(logger, "phone.start", request.Path, response.Status);
            return Results.Ok(response);
          }
          catch (OktaMyAccountException exception)
          {
            LogFailed(logger, "phone.start", request.Path, exception);
            return BuildOktaError(exception);
          }
        })
      .WithName("StartBffAccountPhoneChange")
      .Produces<StartPhoneChangeResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized)
      .Produces(StatusCodes.Status403Forbidden);

    accountGroup.MapPost(
        "/phone/verify",
        async (
          HttpRequest request,
          VerifyPhoneChangeRequest? payload,
          ICsrfTokenService csrfTokenService,
          IAuthSessionService authSessionService,
          IOktaMyAccountService oktaMyAccountService,
          ILoggerFactory loggerFactory,
          CancellationToken cancellationToken) =>
        {
          var logger = CreateLogger(loggerFactory);
          LogRequested(logger, "phone.verify", request.Path);

          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-phone",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            LogDenied(logger, "phone.verify", request.Path);
            return accessTokenResult.Error;
          }

          try
          {
            var response = await oktaMyAccountService.VerifyPhoneChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken);

            LogCompleted(logger, "phone.verify", request.Path, response.Status);
            return Results.Ok(response);
          }
          catch (OktaMyAccountException exception)
          {
            LogFailed(logger, "phone.verify", request.Path, exception);
            return BuildOktaError(exception);
          }
        })
      .WithName("VerifyBffAccountPhoneChange")
      .Produces<VerifyPhoneChangeResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized)
      .Produces(StatusCodes.Status403Forbidden);

    accountGroup.MapPost(
        "/password",
        async (
          HttpRequest request,
          ChangePasswordRequest? payload,
          ICsrfTokenService csrfTokenService,
          IAuthSessionService authSessionService,
          IOktaMyAccountService oktaMyAccountService,
          ILoggerFactory loggerFactory,
          CancellationToken cancellationToken) =>
        {
          var logger = CreateLogger(loggerFactory);
          LogRequested(logger, "password.change", request.Path);

          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-password",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            LogDenied(logger, "password.change", request.Path);
            return accessTokenResult.Error;
          }

          try
          {
            var response = await oktaMyAccountService.ChangePasswordAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken);

            LogCompleted(logger, "password.change", request.Path, response.Status);
            return Results.Ok(response);
          }
          catch (OktaMyAccountException exception)
          {
            LogFailed(logger, "password.change", request.Path, exception);
            return BuildOktaError(exception);
          }
        })
      .WithName("ChangeBffAccountPassword")
      .Produces<ChangePasswordResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized)
      .Produces(StatusCodes.Status403Forbidden);

    return endpoints;
  }

  private static async ValueTask<VerifiedAccessTokenResult> ReadVerifiedAccessTokenAsync(
    HttpRequest request,
    ICsrfTokenService csrfTokenService,
    IAuthSessionService authSessionService,
    string stepUpReason,
    CancellationToken cancellationToken)
  {
    if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(request))
    {
      return new VerifiedAccessTokenResult(
        null,
        BffTrustedProxyBoundary.BuildRejectedResult());
    }

    try
    {
      csrfTokenService.ValidateRequest(request);
    }
    catch (InvalidOperationException exception)
    {
      return new VerifiedAccessTokenResult(
        null,
        Results.Json(
          new { error = exception.Message },
          statusCode: StatusCodes.Status400BadRequest));
    }

    var requirement = new RequireWebAuthSessionRequest(
      true,
      "aal2",
      new WebAuthStepUpRequirement(
        stepUpReason,
        AccountSecurityStepUpMaxAgeSeconds));
    var sessionRequirement = await authSessionService.RequireSessionAsync(
      request,
      requirement,
      cancellationToken);

    if (!sessionRequirement.Satisfied)
    {
      return new VerifiedAccessTokenResult(
        null,
        Results.Json(
          new
          {
            error = sessionRequirement.ErrorMessage
              ?? "Fresh step-up MFA is required for this account change.",
            requiresReauthentication = true,
          },
          statusCode: StatusCodes.Status401Unauthorized));
    }

    var storedSession = await authSessionService.ReadActiveStoredSessionAsync(
      request,
      cancellationToken);
    var accessToken = storedSession?.Tokens.AccessToken;

    if (string.IsNullOrWhiteSpace(accessToken))
    {
      return new VerifiedAccessTokenResult(
        null,
        Results.Json(
          new { error = "The active session does not include an Okta access token." },
          statusCode: StatusCodes.Status401Unauthorized));
    }

    return new VerifiedAccessTokenResult(accessToken, null);
  }

  private static IResult BuildOktaError(OktaMyAccountException exception)
  {
    var clientMessage = exception.ExposeMessageToClient
      ? exception.Message
      : exception.RequiresReauthentication
        ? "Fresh verification is required before this account change can continue."
        : "Unable to complete the account security change right now.";

    return Results.Json(
      new
      {
        error = clientMessage,
        requiresReauthentication = exception.RequiresReauthentication,
      },
      statusCode: exception.StatusCode);
  }

  private static ILogger CreateLogger(ILoggerFactory loggerFactory) =>
    loggerFactory.CreateLogger("Acme.Los.Bff.Api.Features.AccountSecurity");

  private static void LogRequested(
    ILogger logger,
    string action,
    PathString path) =>
    logger.LogInformation(
      "Account security action requested {Action} {Path}",
      action,
      path.ToString());

  private static void LogCompleted(
    ILogger logger,
    string action,
    PathString path,
    string status) =>
    logger.LogInformation(
      "Account security action completed {Action} {Path} {State}",
      action,
      path.ToString(),
      status);

  private static void LogDenied(
    ILogger logger,
    string action,
    PathString path) =>
    logger.LogWarning(
      "Account security action denied {Action} {Path}",
      action,
      path.ToString());

  private static void LogFailed(
    ILogger logger,
    string action,
    PathString path,
    OktaMyAccountException exception) =>
    logger.LogWarning(
      "Account security action failed {Action} {Path} {StatusCode} {RequiresReauthentication}",
      action,
      path.ToString(),
      exception.StatusCode,
      exception.RequiresReauthentication);

  private sealed record VerifiedAccessTokenResult(
    string? AccessToken,
    IResult? Error);
}

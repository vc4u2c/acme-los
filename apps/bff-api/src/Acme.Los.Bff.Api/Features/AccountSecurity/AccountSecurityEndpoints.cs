using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.Okta;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.AccountSecurity;

public static class AccountSecurityEndpoints
{
  private const int AccountSecurityStepUpMaxAgeSeconds = 10 * 60;
  private const string EmailManageScope = "okta.myAccount.email.manage";
  private const string PhoneManageScope = "okta.myAccount.phone.manage";
  private const string PasswordManageScope = "okta.myAccount.password.manage";

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
            EmailManageScope,
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
          IOktaAccountProfileSyncService accountProfileSyncService,
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
            EmailManageScope,
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

            OktaAccountProfileSyncResult profileSync;
            try
            {
              profileSync = await accountProfileSyncService
                .SyncVerifiedEmailLoginAsync(
                  accessTokenResult.UserId!,
                  response.Email,
                  cancellationToken);
            }
            catch (InvalidOperationException exception)
            {
              await authSessionService.RevokeSessionAsync(
                request,
                cancellationToken);
              LogProfileSyncFailed(logger, "email.verify", request.Path, exception);
              return BuildProfileSyncError();
            }

            await authSessionService.RevokeSessionAsync(
              request,
              cancellationToken);

            LogCompleted(
              logger,
              "email.verify",
              request.Path,
              profileSync.Written
                ? "verified-and-login-synced"
                : response.Status);
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
            PhoneManageScope,
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
            PhoneManageScope,
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
            await authSessionService.RevokeSessionAsync(
              request,
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
            PasswordManageScope,
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
            await authSessionService.RevokeSessionAsync(
              request,
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
    string requiredScope,
    CancellationToken cancellationToken)
  {
    if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(request))
    {
      return new VerifiedAccessTokenResult(
        null,
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
    var grantedScopes = (storedSession?.Tokens.Scope ?? string.Empty)
      .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    var userId = sessionRequirement.Session.User?.Id;

    if (string.IsNullOrWhiteSpace(accessToken))
    {
      return new VerifiedAccessTokenResult(
        null,
        null,
        Results.Json(
          new { error = "The active session does not include an Okta access token." },
          statusCode: StatusCodes.Status401Unauthorized));
    }

    if (string.IsNullOrWhiteSpace(userId))
    {
      return new VerifiedAccessTokenResult(
        null,
        null,
        Results.Json(
          new { error = "The active session is missing the Okta user id." },
          statusCode: StatusCodes.Status401Unauthorized));
    }

    if (!grantedScopes.Contains(requiredScope, StringComparer.Ordinal))
    {
      return new VerifiedAccessTokenResult(
        null,
        null,
        Results.Json(
          new { error = "The active session is missing the required account-management permission." },
          statusCode: StatusCodes.Status403Forbidden));
    }

    return new VerifiedAccessTokenResult(accessToken, userId, null);
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

  private static IResult BuildProfileSyncError()
  {
    return Results.Json(
      new
      {
        error = "Email was verified, but ACME could not align the sign-in ID. Please contact support before signing in again.",
      },
      statusCode: StatusCodes.Status502BadGateway);
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

  private static void LogProfileSyncFailed(
    ILogger logger,
    string action,
    PathString path,
    InvalidOperationException exception) =>
    logger.LogWarning(
      exception,
      "Account security profile sync failed {Action} {Path}",
      action,
      path.ToString());

  private sealed record VerifiedAccessTokenResult(
    string? AccessToken,
    string? UserId,
    IResult? Error);
}

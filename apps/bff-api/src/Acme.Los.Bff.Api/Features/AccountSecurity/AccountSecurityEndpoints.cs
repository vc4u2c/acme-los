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
          CancellationToken cancellationToken) =>
        {
          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-email",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            return accessTokenResult.Error;
          }

          try
          {
            return Results.Ok(await oktaMyAccountService.StartEmailChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken));
          }
          catch (OktaMyAccountException exception)
          {
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
          CancellationToken cancellationToken) =>
        {
          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-email",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            return accessTokenResult.Error;
          }

          try
          {
            return Results.Ok(await oktaMyAccountService.VerifyEmailChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken));
          }
          catch (OktaMyAccountException exception)
          {
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
          CancellationToken cancellationToken) =>
        {
          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-phone",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            return accessTokenResult.Error;
          }

          try
          {
            return Results.Ok(await oktaMyAccountService.StartPhoneChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken));
          }
          catch (OktaMyAccountException exception)
          {
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
          CancellationToken cancellationToken) =>
        {
          var accessTokenResult = await ReadVerifiedAccessTokenAsync(
            request,
            csrfTokenService,
            authSessionService,
            "account-phone",
            cancellationToken);

          if (accessTokenResult.Error is not null)
          {
            return accessTokenResult.Error;
          }

          try
          {
            return Results.Ok(await oktaMyAccountService.VerifyPhoneChangeAsync(
              accessTokenResult.AccessToken!,
              payload,
              cancellationToken));
          }
          catch (OktaMyAccountException exception)
          {
            return BuildOktaError(exception);
          }
        })
      .WithName("VerifyBffAccountPhoneChange")
      .Produces<VerifyPhoneChangeResponse>(StatusCodes.Status200OK)
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
    return Results.Json(
      new
      {
        error = exception.Message,
        requiresReauthentication = exception.RequiresReauthentication,
      },
      statusCode: exception.StatusCode);
  }

  private sealed record VerifiedAccessTokenResult(
    string? AccessToken,
    IResult? Error);
}

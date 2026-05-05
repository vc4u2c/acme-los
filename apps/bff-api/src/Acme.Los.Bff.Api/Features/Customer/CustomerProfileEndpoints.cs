using System.Net.Mail;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;
using Wolverine;

namespace Acme.Los.Bff.Api.Features.Customer;

public static class CustomerProfileEndpoints
{
  public static IEndpointRouteBuilder MapBffCustomerEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    var customerGroup = endpoints.MapGroup("/bff/customer");

    customerGroup.MapGet(
        "/profile",
        async (
          HttpRequest request,
          IMessageBus bus,
          CancellationToken cancellationToken) =>
        {
          var identity = BffTrustedIdentity.TryRead(request);

          if (identity is null)
          {
            return Results.Json(
              new { error = "Authentication is required." },
              statusCode: StatusCodes.Status401Unauthorized);
          }

          var profile = await bus.InvokeAsync<GetCustomerProfileResponse>(
            new GetCustomerProfileQuery(identity.UserId, identity.UserEmail),
            cancellationToken);

          return Results.Ok(profile);
        })
      .WithName("GetBffCustomerProfile")
      .Produces<GetCustomerProfileResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status401Unauthorized);

    customerGroup.MapPut(
        "/profile",
        async (
          HttpRequest request,
          UpdateCustomerProfileRequest? payload,
          ICsrfTokenService csrfTokenService,
          IMessageBus bus,
          CancellationToken cancellationToken) =>
        {
          try
          {
            csrfTokenService.ValidateRequest(request);
          }
          catch (InvalidOperationException exception)
          {
            return Results.Json(
              new { error = exception.Message },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var identity = BffTrustedIdentity.TryRead(request);

          if (identity is null)
          {
            return Results.Json(
              new { error = "Authentication is required." },
              statusCode: StatusCodes.Status401Unauthorized);
          }

          if (!CustomerProfileInput.TryNormalize(
            payload,
            identity.UserEmail,
            out var profile,
            out var errorMessage))
          {
            return Results.Json(
              new { error = errorMessage },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var response = await bus.InvokeAsync<UpdateCustomerProfileResponse>(
            new UpdateCustomerProfileCommand(
              identity.UserId,
              identity.UserEmail,
              profile),
            cancellationToken);

          return Results.Ok(response);
        })
      .WithName("UpdateBffCustomerProfile")
      .Produces<UpdateCustomerProfileResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized);

    return endpoints;
  }
}

internal static class CustomerProfileInput
{
  internal static bool TryNormalize(
    UpdateCustomerProfileRequest? request,
    string? fallbackEmail,
    out CustomerProfile profile,
    out string errorMessage)
  {
    if (request?.Profile is null)
    {
      profile = new CustomerProfile("", "", "", "", "", "", "");
      errorMessage = "A customer profile payload is required.";
      return false;
    }

    var normalizedProfile = new CustomerProfile(
      NormalizeEmail(request.Profile.Email, fallbackEmail),
      request.Profile.Phone?.Trim() ?? string.Empty,
      request.Profile.StreetAddress?.Trim() ?? string.Empty,
      request.Profile.AddressLine2?.Trim() ?? string.Empty,
      request.Profile.City?.Trim() ?? string.Empty,
      request.Profile.State?.Trim() ?? string.Empty,
      request.Profile.ZipCode?.Trim() ?? string.Empty);

    if (
      string.IsNullOrWhiteSpace(normalizedProfile.Email)
      || !IsValidEmailAddress(normalizedProfile.Email))
    {
      profile = normalizedProfile;
      errorMessage = "A valid customer profile email address is required.";
      return false;
    }

    profile = normalizedProfile;
    errorMessage = string.Empty;
    return true;
  }

  private static string NormalizeEmail(string? email, string? fallbackEmail)
  {
    var preferredEmail = !string.IsNullOrWhiteSpace(email)
      ? email
      : fallbackEmail;

    return preferredEmail?.Trim() ?? string.Empty;
  }

  private static bool IsValidEmailAddress(string email)
  {
    try
    {
      _ = new MailAddress(email);
      return true;
    }
    catch (FormatException)
    {
      return false;
    }
  }
}

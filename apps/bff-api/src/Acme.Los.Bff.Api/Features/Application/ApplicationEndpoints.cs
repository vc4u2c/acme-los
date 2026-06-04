using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;
using Wolverine;

namespace Acme.Los.Bff.Api.Features.Application;

public static class ApplicationEndpoints
{
  public static IEndpointRouteBuilder MapBffApplicationEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    var applicationGroup = endpoints.MapGroup("/bff/application");

    applicationGroup.MapGet(
        "/steps/{step}",
        async (
          string step,
          HttpRequest request,
          IMessageBus bus,
          CancellationToken cancellationToken) =>
        {
          if (!ApplicationFlowHandler.IsSupportedStep(step))
          {
            return Results.Json(
              new { error = $"Unsupported application step '{step}'." },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var identity = BffTrustedIdentity.TryRead(request);

          if (identity is null)
          {
            return Results.Json(
              new { error = "Authentication is required." },
              statusCode: StatusCodes.Status401Unauthorized);
          }

          var response = await bus.InvokeAsync<GetApplicationStepResponse>(
            new GetApplicationStepQuery(
              identity.Provider,
              identity.UserId,
              identity.CustomerId,
              identity.LeadId,
              step),
            cancellationToken);

          return Results.Ok(response);
        })
      .WithName("GetBffApplicationStep")
      .Produces<GetApplicationStepResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized);

    applicationGroup.MapPut(
        "/steps/{step}",
        async (
          string step,
          HttpRequest request,
          SaveApplicationStepRequest? payload,
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

          if (!ApplicationFlowHandler.IsSupportedStep(step))
          {
            return Results.Json(
              new { error = $"Unsupported application step '{step}'." },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var identity = BffTrustedIdentity.TryRead(request);

          if (identity is null)
          {
            return Results.Json(
              new { error = "Authentication is required." },
              statusCode: StatusCodes.Status401Unauthorized);
          }

          if (payload?.Payload is null)
          {
            return Results.Json(
              new { error = "An application step payload is required." },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var response = await bus.InvokeAsync<SaveApplicationStepResponse>(
            new SaveApplicationStepCommand(
              identity.Provider,
              identity.UserId,
              identity.CustomerId,
              identity.LeadId,
              step,
              payload.Payload),
            cancellationToken);

          return Results.Ok(response);
        })
      .WithName("SaveBffApplicationStep")
      .Produces<SaveApplicationStepResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized);

    applicationGroup.MapPost(
        "/submit",
        async (
          HttpRequest request,
          SubmitApplicationRequest? payload,
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

          if (payload is null || !ApplicationFlowHandler.IsSupportedStep(payload.Step))
          {
            return Results.Json(
              new { error = "A supported application step is required for submit." },
              statusCode: StatusCodes.Status400BadRequest);
          }

          var identity = BffTrustedIdentity.TryRead(request);

          if (identity is null)
          {
            return Results.Json(
              new { error = "Authentication is required." },
              statusCode: StatusCodes.Status401Unauthorized);
          }

          var response = await bus.InvokeAsync<SubmitApplicationResponse>(
            new SubmitApplicationCommand(
              identity.UserId,
              identity.CustomerId,
              identity.LeadId,
              payload.Step,
              payload.Payload),
            cancellationToken);

          return Results.Ok(response);
        })
      .WithName("SubmitBffApplication")
      .Produces<SubmitApplicationResponse>(StatusCodes.Status200OK)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status401Unauthorized);

    return endpoints;
  }
}

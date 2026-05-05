using Acme.Los.Bff.Api.Common;

namespace Acme.Los.Bff.Api.Features.Observability;

public static class ObservabilityEndpoints
{
  public static IEndpointRouteBuilder MapBffObservabilityEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    endpoints.MapPost(
        "/bff/observability/events",
        () => BffProblems.SliceNotImplemented(
          "observability.events",
          "The BFF observability event ingestion endpoint is reserved, but the current event ingestion path still lives in the Next facade."))
      .WithName("PostBffObservabilityEvent")
      .ProducesProblem(StatusCodes.Status501NotImplemented);

    return endpoints;
  }
}

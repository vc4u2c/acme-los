using Acme.Los.Bff.Api.Contracts;

namespace Acme.Los.Bff.Api.Features.Platform;

public static class HealthEndpoints
{
  public static IEndpointRouteBuilder MapBffHealthEndpoints(
      this IEndpointRouteBuilder endpoints)
  {
    endpoints.MapGet("/bff/health", () => Results.Json(BuildHealthSnapshot()))
        .WithName("GetBffHealth")
        .Produces<HealthSnapshot>(StatusCodes.Status200OK);

    return endpoints;
  }

  public static HealthSnapshot BuildHealthSnapshot()
  {
    return new HealthSnapshot(
        "ok",
        "bff-api",
        Environment.GetEnvironmentVariable("ACME_BFF_VERSION")
            ?? Environment.GetEnvironmentVariable("NEXT_PUBLIC_APP_VERSION")
            ?? "0.0.0",
        Environment.GetEnvironmentVariable("APP_BUILD_ID")
            ?? Environment.GetEnvironmentVariable("NEXT_PUBLIC_APP_BUILD"),
        Environment.GetEnvironmentVariable("APP_ENVIRONMENT_NAME")
            ?? Environment.GetEnvironmentVariable("NEXT_PUBLIC_APP_ENVIRONMENT")
            ?? "local",
        Environment.MachineName,
        Environment.ProcessId,
        DateTimeOffset.UtcNow.ToString("O"));
  }
}

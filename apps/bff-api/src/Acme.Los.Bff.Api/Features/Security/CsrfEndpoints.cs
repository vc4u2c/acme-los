using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.Security;

public static class CsrfEndpoints
{
  public static IEndpointRouteBuilder MapBffCsrfEndpoints(
      this IEndpointRouteBuilder endpoints)
  {
    endpoints.MapGet(
            "/bff/security/csrf",
            (HttpContext context, ICsrfTokenService csrfTokenService) =>
                Results.Json(csrfTokenService.IssueToken(context)))
        .WithName("GetBffCsrfToken")
        .Produces<IssueCsrfTokenResponse>(StatusCodes.Status200OK);

    endpoints.MapGet(
            "/bff/security/inspector",
            async (
                HttpContext context,
                ISecurityInspectorService securityInspectorService) =>
            {
              if (!IsSecurityInspectorEnabled(context))
              {
                return Results.Json(
                  new { message = "Not found." },
                  statusCode: StatusCodes.Status404NotFound);
              }

              if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
              {
                return BffTrustedProxyBoundary.BuildRejectedResult();
              }

              return Results.Json(await securityInspectorService.ReadSnapshotAsync(
                context.Request,
                context.RequestAborted));
            })
        .WithName("GetBffSecurityInspector")
        .Produces<SecurityInspectorServerSnapshot>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);

    return endpoints;
  }

  private static bool IsSecurityInspectorEnabled(HttpContext context)
  {
    var overrideValue =
      Environment.GetEnvironmentVariable("ACME_ENABLE_SECURITY_INSPECTOR")?.Trim();

    if (string.Equals(overrideValue, "true", StringComparison.Ordinal))
    {
      return true;
    }

    if (string.Equals(overrideValue, "false", StringComparison.Ordinal))
    {
      return false;
    }

    var appEnvironmentName =
      Environment.GetEnvironmentVariable("APP_ENVIRONMENT_NAME")?.Trim().ToLowerInvariant()
      ?? Environment.GetEnvironmentVariable("NEXT_PUBLIC_APP_ENVIRONMENT")?.Trim().ToLowerInvariant()
      ?? context.RequestServices.GetRequiredService<IHostEnvironment>()
        .EnvironmentName.Trim().ToLowerInvariant();

    return appEnvironmentName is "local" or "dev" or "development";
  }
}

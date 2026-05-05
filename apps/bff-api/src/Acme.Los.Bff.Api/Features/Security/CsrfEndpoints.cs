using Acme.Los.Bff.Api.Contracts;
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

    return endpoints;
  }
}

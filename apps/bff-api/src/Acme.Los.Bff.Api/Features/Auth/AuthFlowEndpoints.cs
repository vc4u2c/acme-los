using Acme.Los.Bff.Api.Common;

namespace Acme.Los.Bff.Api.Features.Auth;

public static class AuthFlowEndpoints
{
  public static IEndpointRouteBuilder MapBffAuthFlowEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    var authGroup = endpoints.MapGroup("/bff/auth");

    authGroup.MapGet(
        "/login",
        () => BffProblems.SliceNotImplemented(
          "auth.login",
          "The BFF login endpoint is reserved but the hosted Okta redirect flow still lives in the Next facade."))
      .WithName("StartBffLogin")
      .ProducesProblem(StatusCodes.Status501NotImplemented);

    authGroup.MapGet(
        "/callback",
        () => BffProblems.SliceNotImplemented(
          "auth.callback",
          "The BFF callback endpoint is reserved but the secure code exchange still lives in the Next facade."))
      .WithName("CompleteBffLoginCallback")
      .ProducesProblem(StatusCodes.Status501NotImplemented);

    authGroup.MapPost(
        "/logout",
        () => BffProblems.SliceNotImplemented(
          "auth.logout",
          "The BFF logout endpoint is reserved but logout orchestration still lives in the Next facade."))
      .WithName("StartBffLogout")
      .ProducesProblem(StatusCodes.Status501NotImplemented);

    return endpoints;
  }
}

namespace Acme.Los.Bff.Api.Common;

internal static class BffProblems
{
  private const string NotImplementedType =
    "https://acme-los.dev/problems/bff-slice-not-implemented";

  internal static IResult SliceNotImplemented(
    string slice,
    string detail)
  {
    return Results.Problem(
      statusCode: StatusCodes.Status501NotImplemented,
      title: "BFF slice not implemented yet.",
      type: NotImplementedType,
      detail: detail,
      extensions: new Dictionary<string, object?>
      {
        ["slice"] = slice,
        ["migrationState"] = "next-facade-still-active",
      });
  }
}

using System.Security.Cryptography;
using System.Text;

namespace Acme.Los.Bff.Api.Common;

internal static class BffTrustedProxyBoundary
{
  internal const string TrustedProxySecretHeaderName = "x-acme-bff-proxy-secret";
  private const string TrustedProxySecretEnvironmentName = "ACME_BFF_TRUSTED_PROXY_SECRET";

  internal static bool HasTrustedProxyBoundary(HttpRequest request)
  {
    var configuredSecret =
      Environment.GetEnvironmentVariable(TrustedProxySecretEnvironmentName)?.Trim();

    if (!string.IsNullOrWhiteSpace(configuredSecret))
    {
      var suppliedSecret = ReadOptionalHeader(
        request,
        TrustedProxySecretHeaderName);

      return suppliedSecret is not null
        && CryptographicOperations.FixedTimeEquals(
          Encoding.UTF8.GetBytes(suppliedSecret),
          Encoding.UTF8.GetBytes(configuredSecret));
    }

    return IsLocalDevelopment(request);
  }

  internal static IResult BuildRejectedResult()
  {
    return Results.Json(
      new { error = "A trusted BFF proxy boundary is required." },
      statusCode: StatusCodes.Status403Forbidden);
  }

  internal static string? ReadOptionalHeader(
    HttpRequest request,
    string headerName)
  {
    var value = request.Headers[headerName].ToString().Trim();
    return string.IsNullOrWhiteSpace(value) ? null : value;
  }

  private static bool IsLocalDevelopment(HttpRequest request)
  {
    var environment = request.HttpContext.RequestServices.GetService<IHostEnvironment>();
    var environmentName =
      environment?.EnvironmentName
      ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
      ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
      ?? string.Empty;

    return string.Equals(environmentName, "Development", StringComparison.OrdinalIgnoreCase)
      || string.Equals(environmentName, "Local", StringComparison.OrdinalIgnoreCase);
  }
}

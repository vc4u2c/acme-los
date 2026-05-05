using System.Security.Cryptography;
using System.Text;

namespace Acme.Los.Bff.Api.Common;

internal sealed record BffTrustedIdentity(
  string UserId,
  string? UserEmail,
  string? CustomerId,
  string? LeadId)
{
  private const string UserIdHeaderName = "x-acme-authenticated-user-id";
  private const string UserEmailHeaderName = "x-acme-authenticated-user-email";
  private const string CustomerIdHeaderName = "x-acme-authenticated-customer-id";
  private const string LeadIdHeaderName = "x-acme-authenticated-lead-id";
  private const string TrustedProxySecretHeaderName = "x-acme-bff-proxy-secret";
  private const string TrustedProxySecretEnvironmentName = "ACME_BFF_TRUSTED_PROXY_SECRET";

  internal static BffTrustedIdentity? TryRead(HttpRequest request)
  {
    var userId = ReadOptionalHeader(request, UserIdHeaderName);

    if (userId is null)
    {
      return null;
    }

    if (!HasTrustedProxyBoundary(request))
    {
      return null;
    }

    return new BffTrustedIdentity(
      userId,
      ReadOptionalHeader(request, UserEmailHeaderName),
      ReadOptionalHeader(request, CustomerIdHeaderName),
      ReadOptionalHeader(request, LeadIdHeaderName));
  }

  private static string? ReadOptionalHeader(
    HttpRequest request,
    string headerName)
  {
    var value = request.Headers[headerName].ToString().Trim();
    return string.IsNullOrWhiteSpace(value) ? null : value;
  }

  private static bool HasTrustedProxyBoundary(HttpRequest request)
  {
    var configuredSecret =
      Environment.GetEnvironmentVariable(TrustedProxySecretEnvironmentName)?.Trim();

    if (!string.IsNullOrWhiteSpace(configuredSecret))
    {
      var suppliedSecret = ReadOptionalHeader(request, TrustedProxySecretHeaderName);

      return suppliedSecret is not null
        && CryptographicOperations.FixedTimeEquals(
          Encoding.UTF8.GetBytes(suppliedSecret),
          Encoding.UTF8.GetBytes(configuredSecret));
    }

    return IsLocalDevelopment(request);
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

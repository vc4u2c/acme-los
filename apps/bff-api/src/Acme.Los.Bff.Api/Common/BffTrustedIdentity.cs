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

  internal static BffTrustedIdentity? TryRead(HttpRequest request)
  {
    var userId = BffTrustedProxyBoundary.ReadOptionalHeader(request, UserIdHeaderName);

    if (userId is null)
    {
      return null;
    }

    if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(request))
    {
      return null;
    }

    return new BffTrustedIdentity(
      userId,
      BffTrustedProxyBoundary.ReadOptionalHeader(request, UserEmailHeaderName),
      BffTrustedProxyBoundary.ReadOptionalHeader(request, CustomerIdHeaderName),
      BffTrustedProxyBoundary.ReadOptionalHeader(request, LeadIdHeaderName));
  }
}

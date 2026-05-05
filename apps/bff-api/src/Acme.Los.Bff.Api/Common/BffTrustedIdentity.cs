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
    var userId = ReadOptionalHeader(request, UserIdHeaderName);

    if (userId is null)
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
}

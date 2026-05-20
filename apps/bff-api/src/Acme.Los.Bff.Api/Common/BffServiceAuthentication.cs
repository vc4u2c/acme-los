namespace Acme.Los.Bff.Api.Common;

internal static class BffServiceAuthentication
{
  private const string TrustedServiceIdentityItemKey =
    "acme-los.bff-service-auth.trusted";

  internal static bool HasTrustedServiceIdentity(HttpContext context)
  {
    return context.Items.TryGetValue(
        TrustedServiceIdentityItemKey,
        out var value)
      && value is BffServiceTokenValidationResult { IsValid: true };
  }

  internal static void MarkTrustedServiceIdentity(
    HttpContext context,
    BffServiceTokenValidationResult result)
  {
    context.Items[TrustedServiceIdentityItemKey] = result;
  }
}

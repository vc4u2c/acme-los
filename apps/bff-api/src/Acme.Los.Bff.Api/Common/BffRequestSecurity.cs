namespace Acme.Los.Bff.Api.Common;

internal static class BffRequestSecurity
{
  internal static bool IsSecureRequest(HttpRequest request)
  {
    if (request.IsHttps)
    {
      return true;
    }

    if (HasHttpsForwardedProto(request.Headers["x-forwarded-proto"].ToString()))
    {
      return true;
    }

    return HasHttpsForwardedHeaderProto(request.Headers["forwarded"].ToString());
  }

  private static bool HasHttpsForwardedProto(string value)
  {
    return value
      .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
      .Any(proto => string.Equals(proto, "https", StringComparison.OrdinalIgnoreCase));
  }

  private static bool HasHttpsForwardedHeaderProto(string value)
  {
    foreach (var forwardedEntry in value.Split(
      ',',
      StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
    {
      foreach (var forwardedPair in forwardedEntry.Split(
        ';',
        StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
      {
        const string protoPrefix = "proto=";

        if (!forwardedPair.StartsWith(protoPrefix, StringComparison.OrdinalIgnoreCase))
        {
          continue;
        }

        var proto = forwardedPair[protoPrefix.Length..].Trim('"');

        if (string.Equals(proto, "https", StringComparison.OrdinalIgnoreCase))
        {
          return true;
        }
      }
    }

    return false;
  }
}

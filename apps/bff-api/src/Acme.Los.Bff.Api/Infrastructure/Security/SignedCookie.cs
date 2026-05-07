using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Acme.Los.Bff.Api.Infrastructure.Security;

internal static class SignedCookie
{
  private const string DevelopmentSessionSecret =
    "acme-los-local-dev-session-secret";

  private static readonly JsonSerializerOptions SerializerOptions = new()
  {
    PropertyNameCaseInsensitive = true,
  };

  internal static T? TryRead<T>(
    string? rawCookieValue,
    IHostEnvironment environment)
    where T : class
  {
    if (string.IsNullOrWhiteSpace(rawCookieValue))
    {
      return null;
    }

    var cookieParts = rawCookieValue.Split('.', 2);

    if (cookieParts.Length != 2
      || string.IsNullOrWhiteSpace(cookieParts[0])
      || string.IsNullOrWhiteSpace(cookieParts[1]))
    {
      return null;
    }

    var expectedSignature = SignValue(cookieParts[0], environment);
    var expectedSignatureBytes = Encoding.UTF8.GetBytes(expectedSignature);
    var actualSignatureBytes = Encoding.UTF8.GetBytes(cookieParts[1]);

    if (expectedSignatureBytes.Length != actualSignatureBytes.Length
      || !CryptographicOperations.FixedTimeEquals(
        expectedSignatureBytes,
        actualSignatureBytes))
    {
      return null;
    }

    try
    {
      return JsonSerializer.Deserialize<T>(
        FromBase64Url(cookieParts[0]),
        SerializerOptions);
    }
    catch (JsonException)
    {
      return null;
    }
    catch (FormatException)
    {
      return null;
    }
  }

  private static string SignValue(
    string value,
    IHostEnvironment environment)
  {
    using var hmac = new HMACSHA256(
      Encoding.UTF8.GetBytes(GetCookieSecret(environment)));

    return ToBase64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(value)));
  }

  private static string GetCookieSecret(IHostEnvironment environment)
  {
    var configuredSecret = Environment.GetEnvironmentVariable("ACME_WEB_SESSION_SECRET")?.Trim();

    if (!string.IsNullOrWhiteSpace(configuredSecret))
    {
      return configuredSecret;
    }

    if (!environment.IsProduction())
    {
      return DevelopmentSessionSecret;
    }

    throw new InvalidOperationException(
      "Set ACME_WEB_SESSION_SECRET before using the web session API in production.");
  }

  private static string FromBase64Url(string value)
  {
    var normalized = value.Replace('-', '+').Replace('_', '/');
    var padded = normalized.Length % 4 == 0
      ? normalized
      : $"{normalized}{new string('=', 4 - (normalized.Length % 4))}";

    return Encoding.UTF8.GetString(Convert.FromBase64String(padded));
  }

  private static string ToBase64Url(byte[] value)
  {
    return Convert.ToBase64String(value)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }
}

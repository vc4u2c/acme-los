using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;

namespace Acme.Los.Bff.Api.Infrastructure.Security;

public interface ICsrfTokenService
{
  IssueCsrfTokenResponse IssueToken(HttpContext context);
  void ValidateRequest(HttpRequest request);
}

public sealed class CsrfTokenService : ICsrfTokenService
{
  private const string DevelopmentSessionSecret =
    "acme-los-local-dev-session-secret";

  public IssueCsrfTokenResponse IssueToken(HttpContext context)
  {
    var token = ResolveExistingToken(context.Request) ?? GenerateToken();

    context.Response.Cookies.Append(
        CookieNames.CsrfToken,
        token,
        BuildCookieOptions(context.Request));

    return new IssueCsrfTokenResponse(token);
  }

  public void ValidateRequest(HttpRequest request)
  {
    var headerToken = request.Headers["x-csrf-token"].ToString().Trim();
    var hasCookieToken = request.Cookies.TryGetValue(
        CookieNames.CsrfToken,
        out var cookieToken);
    var isRawCookieMatch =
      hasCookieToken
      && !string.IsNullOrWhiteSpace(cookieToken)
      && string.Equals(headerToken, cookieToken, StringComparison.Ordinal);
    var isSignedCookieMatch =
      hasCookieToken
      && !string.IsNullOrWhiteSpace(cookieToken)
      && TryReadSignedCookieToken(cookieToken, out var signedCookieToken)
      && string.Equals(headerToken, signedCookieToken, StringComparison.Ordinal);

    if (
        string.IsNullOrWhiteSpace(headerToken)
        || !hasCookieToken
        || string.IsNullOrWhiteSpace(cookieToken)
        || (!isRawCookieMatch && !isSignedCookieMatch))
    {
      throw new InvalidOperationException(
          "The request is missing a valid CSRF token.");
    }
  }

  private static string? ResolveExistingToken(HttpRequest request)
  {
    if (
      !request.Cookies.TryGetValue(CookieNames.CsrfToken, out var existingToken)
      || string.IsNullOrWhiteSpace(existingToken))
    {
      return null;
    }

    if (TryReadSignedCookieToken(existingToken, out var signedCookieToken))
    {
      return signedCookieToken;
    }

    return existingToken.Trim();
  }

  private static CookieOptions BuildCookieOptions(HttpRequest request)
  {
    return new CookieOptions
    {
      HttpOnly = true,
      IsEssential = true,
      MaxAge = TimeSpan.FromHours(8),
      Path = "/",
      SameSite = SameSiteMode.Lax,
      Secure = BffRequestSecurity.IsSecureRequest(request),
    };
  }

  private static string GenerateToken()
  {
    return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');
  }

  private static bool TryReadSignedCookieToken(
    string cookieValue,
    out string? token)
  {
    token = null;

    var parts = cookieValue.Split('.', 2, StringSplitOptions.RemoveEmptyEntries);

    if (parts.Length != 2)
    {
      return false;
    }

    var payloadPart = parts[0];
    var signaturePart = parts[1];
    var expectedSignature = SignCookiePayload(payloadPart);

    if (
      expectedSignature is null
      || !CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(expectedSignature),
        Encoding.UTF8.GetBytes(signaturePart)))
    {
      return false;
    }

    try
    {
      var payloadBytes = FromBase64Url(payloadPart);
      using var jsonDocument = JsonDocument.Parse(payloadBytes);

      if (
        !jsonDocument.RootElement.TryGetProperty("token", out var tokenElement)
        || tokenElement.ValueKind != JsonValueKind.String)
      {
        return false;
      }

      token = tokenElement.GetString();
      return !string.IsNullOrWhiteSpace(token);
    }
    catch (JsonException)
    {
      return false;
    }
    catch (FormatException)
    {
      return false;
    }
  }

  private static string? SignCookiePayload(string payloadPart)
  {
    var secret = ResolveCookieSecret();

    if (secret is null)
    {
      return null;
    }

    return ToBase64Url(
      HMACSHA256.HashData(
        Encoding.UTF8.GetBytes(secret),
        Encoding.UTF8.GetBytes(payloadPart)));
  }

  private static string? ResolveCookieSecret()
  {
    var configuredSecret =
      Environment.GetEnvironmentVariable("ACME_WEB_SESSION_SECRET")?.Trim();

    if (!string.IsNullOrWhiteSpace(configuredSecret))
    {
      return configuredSecret;
    }

    var environmentName =
      Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
      ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");

    return string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase)
      ? null
      : DevelopmentSessionSecret;
  }

  private static byte[] FromBase64Url(string value)
  {
    var normalized = value.Replace('-', '+').Replace('_', '/');
    var padded = normalized.Length % 4 == 0
      ? normalized
      : normalized + new string('=', 4 - (normalized.Length % 4));

    return Convert.FromBase64String(padded);
  }

  private static string ToBase64Url(byte[] bytes)
  {
    return Convert.ToBase64String(bytes)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }
}

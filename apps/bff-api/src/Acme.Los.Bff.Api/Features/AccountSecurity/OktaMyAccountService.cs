using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;

namespace Acme.Los.Bff.Api.Features.AccountSecurity;

public interface IOktaMyAccountService
{
  ValueTask<StartEmailChangeResponse> StartEmailChangeAsync(
    string accessToken,
    StartEmailChangeRequest? request,
    CancellationToken cancellationToken);

  ValueTask<VerifyEmailChangeResponse> VerifyEmailChangeAsync(
    string accessToken,
    VerifyEmailChangeRequest? request,
    CancellationToken cancellationToken);

  ValueTask<StartPhoneChangeResponse> StartPhoneChangeAsync(
    string accessToken,
    StartPhoneChangeRequest? request,
    CancellationToken cancellationToken);

  ValueTask<VerifyPhoneChangeResponse> VerifyPhoneChangeAsync(
    string accessToken,
    VerifyPhoneChangeRequest? request,
    CancellationToken cancellationToken);

  ValueTask<ChangePasswordResponse> ChangePasswordAsync(
    string accessToken,
    ChangePasswordRequest? request,
    CancellationToken cancellationToken);
}

public sealed class OktaMyAccountService : IOktaMyAccountService
{
  private const string OktaMyAccountJsonMediaType =
    "application/json; okta-version=1.0.0";

  private static readonly JsonSerializerOptions JsonOptions =
    new(JsonSerializerDefaults.Web);
  private static readonly Regex SafeOktaIdPattern =
    new("^[A-Za-z0-9_-]{1,128}$", RegexOptions.Compiled);
  private static readonly Regex SafeOktaChallengeIdPattern =
    new("^[A-Za-z0-9._-]{1,256}$", RegexOptions.Compiled);

  private readonly IHttpClientFactory _httpClientFactory;

  public OktaMyAccountService(IHttpClientFactory httpClientFactory)
  {
    _httpClientFactory = httpClientFactory;
  }

  public async ValueTask<StartEmailChangeResponse> StartEmailChangeAsync(
    string accessToken,
    StartEmailChangeRequest? request,
    CancellationToken cancellationToken)
  {
    var email = NormalizeEmail(request?.Email);
    var emailTransaction = await SendAsync<OktaEmailTransaction>(
      accessToken,
      HttpMethod.Post,
      "/idp/myaccount/emails",
      new
      {
        profile = new { email },
        sendEmail = false,
        role = "PRIMARY",
      },
      cancellationToken);

    var emailId = NormalizeOktaResponseId(
      emailTransaction.Id,
      "email transaction id");

    var challenge = await SendAsync<OktaEmailChallengeTransaction>(
      accessToken,
      HttpMethod.Post,
      $"/idp/myaccount/emails/{Uri.EscapeDataString(emailId)}/challenge",
      null,
      cancellationToken);
    var challengeId = NormalizeOktaResponseChallengeId(
      challenge.ChallengeId
        ?? challenge.Id
        ?? TryExtractEmailChallengeIdFromVerifyLink(
          challenge.Links?.Verify?.Href,
          emailId)
        ?? TryExtractEmailChallengeIdFromVerifyLink(
          emailTransaction.Links?.Verify?.Href,
          emailId),
      "email challenge id");

    return new StartEmailChangeResponse(
      emailId,
      challengeId,
      emailTransaction.Profile?.Email ?? email,
      "pending_verification");
  }

  public async ValueTask<VerifyEmailChangeResponse> VerifyEmailChangeAsync(
    string accessToken,
    VerifyEmailChangeRequest? request,
    CancellationToken cancellationToken)
  {
    var emailId = NormalizeOktaId(request?.EmailId, "email id");
    var challengeId = NormalizeOktaChallengeId(
      request?.ChallengeId,
      "email challenge id");
    var verificationCode = NormalizeVerificationCode(request?.VerificationCode);

    await SendAsync<JsonElement?>(
      accessToken,
      HttpMethod.Post,
      $"/idp/myaccount/emails/{Uri.EscapeDataString(emailId)}/challenge/{Uri.EscapeDataString(challengeId)}/verify",
      new { verificationCode },
      cancellationToken,
      expectBody: false);

    return new VerifyEmailChangeResponse("verified");
  }

  public async ValueTask<StartPhoneChangeResponse> StartPhoneChangeAsync(
    string accessToken,
    StartPhoneChangeRequest? request,
    CancellationToken cancellationToken)
  {
    var phoneNumber = NormalizePhoneNumber(request?.PhoneNumber);
    var phoneTransaction = await SendAsync<OktaPhoneTransaction>(
      accessToken,
      HttpMethod.Post,
      "/idp/myaccount/phones",
      new
      {
        profile = new { phoneNumber },
        sendCode = true,
        method = "SMS",
      },
      cancellationToken);

    var phoneId = NormalizeOktaResponseId(
      phoneTransaction.Id,
      "phone transaction id");

    return new StartPhoneChangeResponse(
      phoneId,
      phoneTransaction.Profile?.PhoneNumber ?? phoneNumber,
      "pending_verification");
  }

  public async ValueTask<VerifyPhoneChangeResponse> VerifyPhoneChangeAsync(
    string accessToken,
    VerifyPhoneChangeRequest? request,
    CancellationToken cancellationToken)
  {
    var phoneId = NormalizeOktaId(request?.PhoneId, "phone id");
    var verificationCode = NormalizeVerificationCode(request?.VerificationCode);

    await SendAsync<JsonElement?>(
      accessToken,
      HttpMethod.Post,
      $"/idp/myaccount/phones/{Uri.EscapeDataString(phoneId)}/verify",
      new { verificationCode },
      cancellationToken,
      expectBody: false);

    return new VerifyPhoneChangeResponse("verified");
  }

  public async ValueTask<ChangePasswordResponse> ChangePasswordAsync(
    string accessToken,
    ChangePasswordRequest? request,
    CancellationToken cancellationToken)
  {
    var currentPassword = NormalizePasswordInput(
      request?.CurrentPassword,
      "current password");
    var newPassword = NormalizePasswordInput(
      request?.NewPassword,
      "new password");

    if (string.Equals(currentPassword, newPassword, StringComparison.Ordinal))
    {
      throw new OktaMyAccountException(
        "Choose a new password that is different from the current password.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    await SendAsync<JsonElement?>(
      accessToken,
      HttpMethod.Put,
      "/idp/myaccount/password",
      new
      {
        profile = new
        {
          currentPassword,
          password = newPassword,
        },
      },
      cancellationToken,
      expectBody: false);

    return new ChangePasswordResponse("changed");
  }

  private async ValueTask<T> SendAsync<T>(
    string accessToken,
    HttpMethod method,
    string path,
    object? body,
    CancellationToken cancellationToken,
    bool expectBody = true)
  {
    var options = OktaAuthOptions.FromEnvironment();
    var issuerUri = new Uri(options.Issuer);
    var requestUri = new Uri(
      $"{issuerUri.Scheme}://{issuerUri.Authority}{path}");
    using var request = new HttpRequestMessage(method, requestUri);

    request.Headers.Authorization = new AuthenticationHeaderValue(
      "Bearer",
      accessToken);
    request.Headers.Accept.ParseAdd(OktaMyAccountJsonMediaType);

    if (body is not null)
    {
      request.Content = JsonContent.Create(body, options: JsonOptions);
      request.Content.Headers.ContentType =
        MediaTypeHeaderValue.Parse(OktaMyAccountJsonMediaType);
    }

    using var response = await _httpClientFactory.CreateClient().SendAsync(
      request,
      cancellationToken);

    if (!response.IsSuccessStatusCode)
    {
      throw await BuildOktaExceptionAsync(response, cancellationToken);
    }

    if (!expectBody
      || response.StatusCode == System.Net.HttpStatusCode.NoContent)
    {
      return default!;
    }

    return await response.Content.ReadFromJsonAsync<T>(
      JsonOptions,
      cancellationToken)
      ?? throw new OktaMyAccountException(
        "Okta returned an empty MyAccount response.",
        StatusCodes.Status502BadGateway);
  }

  private static async ValueTask<OktaMyAccountException> BuildOktaExceptionAsync(
    HttpResponseMessage response,
    CancellationToken cancellationToken)
  {
    OktaErrorResponse? error = null;
    var fallbackMessage = $"Okta MyAccount returned {(int)response.StatusCode}.";

    try
    {
      error = await response.Content.ReadFromJsonAsync<OktaErrorResponse>(
        JsonOptions,
        cancellationToken);
    }
    catch (JsonException)
    {
    }
    catch (NotSupportedException)
    {
    }

    var message =
      error?.ErrorSummary
      ?? error?.ErrorDescription
      ?? error?.Error
      ?? fallbackMessage;
    var requiresReauthentication =
      message.Contains(
        "insufficient_authentication_context",
        StringComparison.OrdinalIgnoreCase)
      || string.Equals(
        error?.ErrorSummary,
        "insufficient_authentication_context",
        StringComparison.OrdinalIgnoreCase);
    var statusCode = requiresReauthentication
      ? StatusCodes.Status401Unauthorized
      : Math.Clamp((int)response.StatusCode, 400, 599);
    var clientSafeMessage = BuildClientSafeMessage(
      error,
      message,
      statusCode);

    return new OktaMyAccountException(
      clientSafeMessage ?? message,
      statusCode,
      requiresReauthentication,
      exposeMessageToClient: clientSafeMessage is not null);
  }

  private static string? BuildClientSafeMessage(
    OktaErrorResponse? error,
    string message,
    int statusCode)
  {
    var errorCode = error?.ErrorCode ?? string.Empty;
    var normalizedMessage = message.ToLowerInvariant();

    if (string.Equals(errorCode, "E0000157", StringComparison.OrdinalIgnoreCase)
      || statusCode == StatusCodes.Status409Conflict)
    {
      return "That email or phone is already associated with an Okta account. Use a different value or sign in with that account.";
    }

    if (string.Equals(errorCode, "E0000038", StringComparison.OrdinalIgnoreCase))
    {
      return "This account change is not enabled in Okta for this environment. Ask support to verify the account-management policy.";
    }

    if (normalizedMessage.Contains("insufficient_scope", StringComparison.Ordinal)
      || normalizedMessage.Contains("scope", StringComparison.Ordinal))
    {
      return "The Okta app is missing the required MyAccount permission for this account change.";
    }

    if (string.Equals(errorCode, "E0000012", StringComparison.OrdinalIgnoreCase)
      || statusCode == StatusCodes.Status415UnsupportedMediaType
      || normalizedMessage.Contains("unsupported media type", StringComparison.Ordinal)
      || normalizedMessage.Contains("content-type", StringComparison.Ordinal))
    {
      return "Okta rejected the account-management request format. Try again or ask support to verify the MyAccount API configuration.";
    }

    if (normalizedMessage.Contains("verification", StringComparison.Ordinal)
      || normalizedMessage.Contains("challenge", StringComparison.Ordinal)
      || normalizedMessage.Contains("expired", StringComparison.Ordinal))
    {
      return "The verification code is invalid or expired. Request a new code and try again.";
    }

    if (normalizedMessage.Contains("currentpassword", StringComparison.Ordinal)
      || normalizedMessage.Contains("current password", StringComparison.Ordinal)
      || normalizedMessage.Contains("password", StringComparison.Ordinal))
    {
      return "Okta rejected the password change. Check the current password and password requirements, then try again.";
    }

    if (statusCode == StatusCodes.Status400BadRequest)
    {
      return "Okta rejected this account change. Check the value and try again.";
    }

    return null;
  }

  private static string NormalizeEmail(string? value)
  {
    var email = value?.Trim() ?? string.Empty;

    if (string.IsNullOrWhiteSpace(email))
    {
      throw new OktaMyAccountException(
        "A valid new email address is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    try
    {
      _ = new MailAddress(email);
    }
    catch (FormatException)
    {
      throw new OktaMyAccountException(
        "A valid new email address is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return email;
  }

  private static string NormalizePhoneNumber(string? value)
  {
    var phoneNumber = value?.Trim() ?? string.Empty;
    var compactPhoneNumber = Regex.Replace(phoneNumber, "[^0-9+]", "");

    if (compactPhoneNumber.Length == 10 && compactPhoneNumber.All(char.IsDigit))
    {
      compactPhoneNumber = $"+1{compactPhoneNumber}";
    }
    else if (
      compactPhoneNumber.Length == 11
      && compactPhoneNumber.StartsWith('1')
      && compactPhoneNumber.All(char.IsDigit))
    {
      compactPhoneNumber = $"+{compactPhoneNumber}";
    }

    if (!Regex.IsMatch(compactPhoneNumber, "^\\+[1-9][0-9]{7,14}$"))
    {
      throw new OktaMyAccountException(
        "A valid SMS-capable phone number is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return compactPhoneNumber;
  }

  private static string NormalizeVerificationCode(string? value)
  {
    var code = value?.Trim() ?? string.Empty;

    if (!Regex.IsMatch(code, "^[0-9A-Za-z]{4,12}$"))
    {
      throw new OktaMyAccountException(
        "A valid verification code is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return code;
  }

  private static string NormalizePasswordInput(string? value, string label)
  {
    var password = value ?? string.Empty;

    if (password.Length == 0 || password.Length > 256)
    {
      throw new OktaMyAccountException(
        $"A valid {label} is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return password;
  }

  private static string NormalizeOktaId(string? value, string label)
  {
    var normalizedValue = value?.Trim() ?? string.Empty;

    if (!SafeOktaIdPattern.IsMatch(normalizedValue))
    {
      throw new OktaMyAccountException(
        $"A valid {label} is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return normalizedValue;
  }

  private static string NormalizeOktaResponseId(string? value, string label)
  {
    var normalizedValue = value?.Trim() ?? string.Empty;

    if (!SafeOktaIdPattern.IsMatch(normalizedValue))
    {
      throw new OktaMyAccountException(
        $"Okta did not return a valid {label}.",
        StatusCodes.Status502BadGateway);
    }

    return normalizedValue;
  }

  private static string NormalizeOktaChallengeId(string? value, string label)
  {
    var normalizedValue = value?.Trim() ?? string.Empty;

    if (!SafeOktaChallengeIdPattern.IsMatch(normalizedValue))
    {
      throw new OktaMyAccountException(
        $"A valid {label} is required.",
        StatusCodes.Status400BadRequest,
        exposeMessageToClient: true);
    }

    return normalizedValue;
  }

  private static string NormalizeOktaResponseChallengeId(
    string? value,
    string label)
  {
    var normalizedValue = value?.Trim() ?? string.Empty;

    if (!SafeOktaChallengeIdPattern.IsMatch(normalizedValue))
    {
      throw new OktaMyAccountException(
        $"Okta did not return a valid {label}.",
        StatusCodes.Status502BadGateway);
    }

    return normalizedValue;
  }

  private static string? TryExtractEmailChallengeIdFromVerifyLink(
    string? href,
    string emailId)
  {
    var trimmedHref = href?.Trim();

    if (string.IsNullOrWhiteSpace(trimmedHref))
    {
      return null;
    }

    if (!Uri.TryCreate(trimmedHref, UriKind.Absolute, out var uri)
      && !Uri.TryCreate(
        $"https://okta.invalid{trimmedHref}",
        UriKind.Absolute,
        out uri))
    {
      return null;
    }

    var segments = uri.AbsolutePath
      .Split('/', StringSplitOptions.RemoveEmptyEntries)
      .Select(Uri.UnescapeDataString)
      .ToArray();

    for (var index = 0; index <= segments.Length - 7; index += 1)
    {
      if (!string.Equals(segments[index], "idp", StringComparison.Ordinal)
        || !string.Equals(segments[index + 1], "myaccount", StringComparison.Ordinal)
        || !string.Equals(segments[index + 2], "emails", StringComparison.Ordinal)
        || !string.Equals(segments[index + 3], emailId, StringComparison.Ordinal)
        || !string.Equals(segments[index + 4], "challenge", StringComparison.Ordinal)
        || !string.Equals(segments[index + 6], "verify", StringComparison.Ordinal))
      {
        continue;
      }

      return segments[index + 5];
    }

    return null;
  }
}

public sealed class OktaMyAccountException : Exception
{
  public OktaMyAccountException(
    string message,
    int statusCode,
    bool requiresReauthentication = false,
    bool exposeMessageToClient = false)
    : base(message)
  {
    StatusCode = statusCode;
    RequiresReauthentication = requiresReauthentication;
    ExposeMessageToClient = exposeMessageToClient;
  }

  public int StatusCode { get; }
  public bool RequiresReauthentication { get; }
  public bool ExposeMessageToClient { get; }
}

internal sealed record OktaEmailTransaction(
  string? Id,
  string? Status,
  OktaEmailProfile? Profile,
  [property: JsonPropertyName("_links")]
  OktaEmailChallengeLinks? Links);

internal sealed record OktaEmailChallengeTransaction(
  [property: JsonPropertyName("challengeId")]
  string? ChallengeId,
  string? Id,
  string? Status,
  DateTimeOffset? ExpiresAt,
  [property: JsonPropertyName("_links")]
  OktaEmailChallengeLinks? Links);

internal sealed record OktaEmailChallengeLinks(
  OktaLink? Verify);

internal sealed record OktaLink(string? Href);

internal sealed record OktaEmailProfile(string? Email);

internal sealed record OktaPhoneTransaction(
  string? Id,
  string? Status,
  OktaPhoneProfile? Profile);

internal sealed record OktaPhoneProfile(string? PhoneNumber);

internal sealed record OktaErrorResponse(
  [property: JsonPropertyName("error")]
  string? Error = null,
  [property: JsonPropertyName("error_description")]
  string? ErrorDescription = null,
  [property: JsonPropertyName("errorSummary")]
  string? ErrorSummary = null,
  [property: JsonPropertyName("errorCode")]
  string? ErrorCode = null);

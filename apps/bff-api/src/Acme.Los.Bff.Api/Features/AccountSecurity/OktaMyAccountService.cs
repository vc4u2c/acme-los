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
}

public sealed class OktaMyAccountService : IOktaMyAccountService
{
  private static readonly JsonSerializerOptions JsonOptions =
    new(JsonSerializerDefaults.Web);
  private static readonly Regex SafeOktaIdPattern =
    new("^[A-Za-z0-9_-]{1,128}$", RegexOptions.Compiled);

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

    if (string.IsNullOrWhiteSpace(emailTransaction.Id))
    {
      throw new OktaMyAccountException(
        "Okta did not return an email transaction id.",
        StatusCodes.Status502BadGateway);
    }

    var challenge = await SendAsync<OktaEmailChallengeTransaction>(
      accessToken,
      HttpMethod.Post,
      $"/idp/myaccount/emails/{Uri.EscapeDataString(emailTransaction.Id)}/challenge",
      null,
      cancellationToken);

    if (string.IsNullOrWhiteSpace(challenge.Id))
    {
      throw new OktaMyAccountException(
        "Okta did not return an email challenge id.",
        StatusCodes.Status502BadGateway);
    }

    return new StartEmailChangeResponse(
      emailTransaction.Id,
      challenge.Id,
      emailTransaction.Profile?.Email ?? email,
      "pending_verification");
  }

  public async ValueTask<VerifyEmailChangeResponse> VerifyEmailChangeAsync(
    string accessToken,
    VerifyEmailChangeRequest? request,
    CancellationToken cancellationToken)
  {
    var emailId = NormalizeOktaId(request?.EmailId, "email id");
    var challengeId = NormalizeOktaId(request?.ChallengeId, "email challenge id");
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

    if (string.IsNullOrWhiteSpace(phoneTransaction.Id))
    {
      throw new OktaMyAccountException(
        "Okta did not return a phone transaction id.",
        StatusCodes.Status502BadGateway);
    }

    return new StartPhoneChangeResponse(
      phoneTransaction.Id,
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
    request.Headers.Accept.ParseAdd("application/json; okta-version=1.0.0");

    if (body is not null)
    {
      request.Content = JsonContent.Create(body, options: JsonOptions);
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

    return new OktaMyAccountException(
      message,
      statusCode,
      requiresReauthentication);
  }

  private static string NormalizeEmail(string? value)
  {
    var email = value?.Trim() ?? string.Empty;

    if (string.IsNullOrWhiteSpace(email))
    {
      throw new OktaMyAccountException(
        "A valid new email address is required.",
        StatusCodes.Status400BadRequest);
    }

    try
    {
      _ = new MailAddress(email);
    }
    catch (FormatException)
    {
      throw new OktaMyAccountException(
        "A valid new email address is required.",
        StatusCodes.Status400BadRequest);
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
        StatusCodes.Status400BadRequest);
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
        StatusCodes.Status400BadRequest);
    }

    return code;
  }

  private static string NormalizeOktaId(string? value, string label)
  {
    var normalizedValue = value?.Trim() ?? string.Empty;

    if (!SafeOktaIdPattern.IsMatch(normalizedValue))
    {
      throw new OktaMyAccountException(
        $"A valid {label} is required.",
        StatusCodes.Status400BadRequest);
    }

    return normalizedValue;
  }
}

public sealed class OktaMyAccountException : Exception
{
  public OktaMyAccountException(
    string message,
    int statusCode,
    bool requiresReauthentication = false)
    : base(message)
  {
    StatusCode = statusCode;
    RequiresReauthentication = requiresReauthentication;
  }

  public int StatusCode { get; }
  public bool RequiresReauthentication { get; }
}

internal sealed record OktaEmailTransaction(
  string? Id,
  string? Status,
  OktaEmailProfile? Profile);

internal sealed record OktaEmailChallengeTransaction(
  string? Id,
  string? Status,
  DateTimeOffset? ExpiresAt);

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

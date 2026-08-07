using System.Net.Http.Json;
using System.Net.Mail;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

public interface IOktaAccountProfileSyncService
{
  Task<OktaAccountProfileSyncResult> SyncVerifiedEmailLoginAsync(
    string oktaUserId,
    string verifiedEmail,
    CancellationToken cancellationToken);
}

public sealed record OktaAccountProfileSyncResult(
  bool Written,
  string? SkippedReason);

internal sealed class OktaAccountProfileSyncService
  : IOktaAccountProfileSyncService
{
  private static readonly Regex SafeOktaUserIdPattern =
    new("^[A-Za-z0-9_-]{1,128}$", RegexOptions.Compiled);

  private readonly IHttpClientFactory _httpClientFactory;
  private readonly ILogger<OktaAccountProfileSyncService> _logger;
  private readonly IOktaManagementTokenClient _tokenClient;
  private readonly OktaCustomerIdWritebackOptions _options;

  public OktaAccountProfileSyncService(
    IHttpClientFactory httpClientFactory,
    ILogger<OktaAccountProfileSyncService> logger,
    IOktaManagementTokenClient tokenClient,
    OktaCustomerIdWritebackOptions options)
  {
    _httpClientFactory = httpClientFactory;
    _logger = logger;
    _tokenClient = tokenClient;
    _options = options;
  }

  public async Task<OktaAccountProfileSyncResult> SyncVerifiedEmailLoginAsync(
    string oktaUserId,
    string verifiedEmail,
    CancellationToken cancellationToken)
  {
    if (!_options.EmailLoginSyncEnabled)
    {
      return new OktaAccountProfileSyncResult(false, "disabled");
    }

    var normalizedUserId = NormalizeOktaUserId(oktaUserId);
    var normalizedEmail = NormalizeEmail(verifiedEmail);
    var currentProfile = await ReadUserProfileAsync(
      normalizedUserId,
      cancellationToken);

    if (
      string.Equals(currentProfile.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase)
      && string.Equals(currentProfile.Login, normalizedEmail, StringComparison.OrdinalIgnoreCase))
    {
      return new OktaAccountProfileSyncResult(false, "already-synced");
    }

    await WriteEmailAndLoginAsync(
      normalizedUserId,
      normalizedEmail,
      cancellationToken);

    _logger.LogInformation(
      "Synced Okta user email and login after verified email change. Event={Event} Source={Source}",
      "customer.profile.email_login_synced",
      "okta-management-oauth");

    return new OktaAccountProfileSyncResult(true, null);
  }

  private async Task<OktaUserProfileSnapshot> ReadUserProfileAsync(
    string oktaUserId,
    CancellationToken cancellationToken)
  {
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      BuildOktaUserUri(oktaUserId));

    request.Headers.Accept.ParseAdd("application/json");

    using var response = await _tokenClient.SendAuthorizedAsync(
      CreateHttpClient(),
      request,
      cancellationToken);

    if (!response.IsSuccessStatusCode)
    {
      throw new InvalidOperationException(
        $"Okta profile lookup failed ({(int)response.StatusCode}).");
    }

    var payload = await response.Content.ReadFromJsonAsync<JsonElement>(
      cancellationToken);

    return ReadProfileSnapshot(payload);
  }

  private async Task WriteEmailAndLoginAsync(
    string oktaUserId,
    string email,
    CancellationToken cancellationToken)
  {
    using var request = new HttpRequestMessage(
      HttpMethod.Post,
      BuildOktaUserUri(oktaUserId))
    {
      Content = JsonContent.Create(new
      {
        profile = new
        {
          email,
          login = email,
        },
      }),
    };

    request.Headers.Accept.ParseAdd("application/json");

    using var response = await _tokenClient.SendAuthorizedAsync(
      CreateHttpClient(),
      request,
      cancellationToken);

    if (!response.IsSuccessStatusCode)
    {
      throw new InvalidOperationException(
        $"Okta email login sync failed ({(int)response.StatusCode}).");
    }
  }

  private Uri BuildOktaUserUri(string oktaUserId)
  {
    return new Uri(
      _options.OktaOrgBaseUri,
      $"api/v1/users/{Uri.EscapeDataString(oktaUserId)}");
  }

  private HttpClient CreateHttpClient()
  {
    return _httpClientFactory.CreateClient(nameof(OktaAccountProfileSyncService));
  }

  private static OktaUserProfileSnapshot ReadProfileSnapshot(JsonElement payload)
  {
    if (
      payload.ValueKind != JsonValueKind.Object
      || !payload.TryGetProperty("profile", out var profile)
      || profile.ValueKind != JsonValueKind.Object)
    {
      return new OktaUserProfileSnapshot(null, null);
    }

    return new OktaUserProfileSnapshot(
      ReadOptionalString(profile, "email"),
      ReadOptionalString(profile, "login"));
  }

  private static string? ReadOptionalString(JsonElement payload, string name)
  {
    if (
      !payload.TryGetProperty(name, out var value)
      || value.ValueKind != JsonValueKind.String)
    {
      return null;
    }

    var text = value.GetString()?.Trim();
    return string.IsNullOrWhiteSpace(text) ? null : text;
  }

  private static string NormalizeOktaUserId(string value)
  {
    var normalizedValue = value.Trim();

    if (!SafeOktaUserIdPattern.IsMatch(normalizedValue))
    {
      throw new InvalidOperationException(
        "A valid Okta user id is required for email login sync.");
    }

    return normalizedValue;
  }

  private static string NormalizeEmail(string value)
  {
    var email = value.Trim();

    if (string.IsNullOrWhiteSpace(email))
    {
      throw new InvalidOperationException(
        "A verified email address is required for email login sync.");
    }

    try
    {
      _ = new MailAddress(email);
    }
    catch (FormatException)
    {
      throw new InvalidOperationException(
        "A verified email address is required for email login sync.");
    }

    return email;
  }

  private sealed record OktaUserProfileSnapshot(
    string? Email,
    string? Login);
}

using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Acme.Los.Bff.Api.Infrastructure.Okta;

public interface IOktaCustomerIdWritebackService
{
  Task<OktaCustomerIdWritebackResult> EnsureCustomerIdAsync(
    string? provider,
    string userId,
    string? currentCustomerId,
    string step,
    CancellationToken cancellationToken);
}

public sealed record OktaCustomerIdWritebackResult(
  string? CustomerId,
  bool Written,
  string? Source,
  string? SkippedReason);

internal sealed class OktaCustomerIdWritebackService
  : IOktaCustomerIdWritebackService
{
  private const string PersonalInfoStep = "personal-info";
  private const string SampleCustomerIdPrefix = "sample-customer-";

  private readonly IHttpClientFactory _httpClientFactory;
  private readonly ILogger<OktaCustomerIdWritebackService> _logger;
  private readonly IOktaManagementTokenClient _tokenClient;
  private readonly OktaCustomerIdWritebackOptions _options;

  public OktaCustomerIdWritebackService(
    IHttpClientFactory httpClientFactory,
    ILogger<OktaCustomerIdWritebackService> logger,
    IOktaManagementTokenClient tokenClient,
    OktaCustomerIdWritebackOptions options)
  {
    _httpClientFactory = httpClientFactory;
    _logger = logger;
    _tokenClient = tokenClient;
    _options = options;
  }

  public async Task<OktaCustomerIdWritebackResult> EnsureCustomerIdAsync(
    string? provider,
    string userId,
    string? currentCustomerId,
    string step,
    CancellationToken cancellationToken)
  {
    if (!string.Equals(step, PersonalInfoStep, StringComparison.Ordinal))
    {
      return Skipped("unsupported-step");
    }

    if (!string.Equals(provider, "okta", StringComparison.OrdinalIgnoreCase))
    {
      return Skipped("non-okta-session");
    }

    if (!string.IsNullOrWhiteSpace(currentCustomerId))
    {
      return new OktaCustomerIdWritebackResult(
        currentCustomerId,
        Written: false,
        Source: "trusted-session",
        SkippedReason: "existing-session-customer-id");
    }

    if (!_options.IsEnabled)
    {
      return Skipped("disabled");
    }

    var existingCustomerId = await ReadOktaCustomerIdAsync(
      userId,
      cancellationToken);

    if (!string.IsNullOrWhiteSpace(existingCustomerId))
    {
      return new OktaCustomerIdWritebackResult(
        existingCustomerId,
        Written: false,
        Source: "okta-profile",
        SkippedReason: null);
    }

    var nextCustomerId = BuildSampleCustomerId(userId);

    await WriteOktaCustomerIdAsync(
      userId,
      nextCustomerId,
      cancellationToken);

    _logger.LogInformation(
      "Wrote customer id to Okta profile. Event={Event} Source={Source}",
      "customer.identity.customer_id_written",
      "okta-management-oauth");

    return new OktaCustomerIdWritebackResult(
      nextCustomerId,
      Written: true,
      Source: "sample-writeback",
      SkippedReason: null);
  }

  internal static string BuildSampleCustomerId(string oktaUserId)
  {
    var digest = SHA256.HashData(Encoding.UTF8.GetBytes(oktaUserId));
    var hex = Convert.ToHexString(digest).ToLowerInvariant();

    return $"{SampleCustomerIdPrefix}{hex[..12]}";
  }

  private async Task<string?> ReadOktaCustomerIdAsync(
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
        $"Okta customer lookup failed ({(int)response.StatusCode}).");
    }

    var payload = await response.Content.ReadFromJsonAsync<JsonElement>(
      cancellationToken);

    return ReadProfileCustomerId(payload);
  }

  private async Task WriteOktaCustomerIdAsync(
    string oktaUserId,
    string customerId,
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
          customerId,
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
        $"Okta customer id write-back failed ({(int)response.StatusCode}).");
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
    return _httpClientFactory.CreateClient(nameof(OktaCustomerIdWritebackService));
  }

  private static string? ReadProfileCustomerId(JsonElement payload)
  {
    if (
      payload.ValueKind != JsonValueKind.Object
      || !payload.TryGetProperty("profile", out var profile)
      || profile.ValueKind != JsonValueKind.Object
      || !profile.TryGetProperty("customerId", out var customerId)
      || customerId.ValueKind != JsonValueKind.String)
    {
      return null;
    }

    var value = customerId.GetString()?.Trim();
    return string.IsNullOrWhiteSpace(value) ? null : value;
  }

  private static OktaCustomerIdWritebackResult Skipped(string reason)
  {
    return new OktaCustomerIdWritebackResult(
      CustomerId: null,
      Written: false,
      Source: null,
      SkippedReason: reason);
  }
}

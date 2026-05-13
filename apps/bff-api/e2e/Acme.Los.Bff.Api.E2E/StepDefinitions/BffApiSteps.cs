using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Reqnroll;
using Xunit;

namespace Acme.Los.Bff.Api.E2E.StepDefinitions;

[Binding]
public sealed class BffApiSteps : IDisposable
{
  private const string AuthSessionCookieName = "acme-los.auth-session";
  private const string CsrfCookieName = "acme-los.csrf-token";
  private const string DevelopmentSessionSecret =
    "acme-los-local-dev-session-secret";

  private readonly HttpClient _client;
  private readonly WebApplicationFactory<global::Program>? _factory;
  private readonly Dictionary<string, string> _defaultHeaders = [];
  private readonly Dictionary<string, string> _trustedIdentityHeaders = [];
  private IReadOnlyList<string> _setCookieHeaders = [];
  private string? _authSessionId;
  private string? _authSessionCookieValue;
  private string? _csrfToken;
  private HttpResponseMessage? _response;
  private JsonDocument? _jsonPayload;

  public BffApiSteps()
  {
    var liveBaseUrl =
      Environment.GetEnvironmentVariable("ACME_BFF_E2E_BASE_URL")?.Trim();

    if (!string.IsNullOrWhiteSpace(liveBaseUrl))
    {
      _client = new HttpClient
      {
        BaseAddress = new Uri(liveBaseUrl, UriKind.Absolute),
      };
      return;
    }

    _factory = new WebApplicationFactory<global::Program>()
      .WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
    _client = _factory.CreateClient();
  }

  [Given(
    "I am a trusted BFF caller for user {string} with email {string}")]
  public void GivenIAmATrustedBffCallerForUserWithEmail(
    string userId,
    string email)
  {
    _trustedIdentityHeaders["x-acme-authenticated-user-id"] = userId;
    _trustedIdentityHeaders["x-acme-authenticated-user-email"] = email;

    var proxySecret =
      Environment.GetEnvironmentVariable("ACME_BFF_TRUSTED_PROXY_SECRET")?.Trim();

    if (!string.IsNullOrWhiteSpace(proxySecret))
    {
      _trustedIdentityHeaders["x-acme-bff-proxy-secret"] = proxySecret;
    }
  }

  [Given("the request is forwarded over HTTPS")]
  public void GivenTheRequestIsForwardedOverHttps()
  {
    _defaultHeaders["x-forwarded-proto"] = "https";
  }

  [Given("I have a BFF CSRF token")]
  public async Task GivenIHaveABffCsrfToken()
  {
    await WhenIRequestABffCsrfToken();
    ThenTheResponseStatusCodeShouldBe(nameof(HttpStatusCode.OK));
    await ThenTheCsrfTokenContractShouldIncludeAToken();
  }

  [When("I request the BFF health snapshot")]
  public async Task WhenIRequestTheBffHealthSnapshot()
  {
    await SendAsync(CreateRequest(HttpMethod.Get, "/bff/health"));
  }

  [When("I request the BFF live health endpoint")]
  public async Task WhenIRequestTheBffLiveHealthEndpoint()
  {
    await SendAsync(CreateRequest(HttpMethod.Get, "/health/live"));
  }

  [When("I request the BFF ready health endpoint")]
  public async Task WhenIRequestTheBffReadyHealthEndpoint()
  {
    await SendAsync(CreateRequest(HttpMethod.Get, "/health/ready"));
  }

  [When("I request the BFF OpenAPI document")]
  public async Task WhenIRequestTheBffOpenApiDocument()
  {
    await SendAsync(CreateRequest(HttpMethod.Get, "/openapi/v1.json"));
  }

  [When("I request a BFF CSRF token")]
  public async Task WhenIRequestABffCsrfToken()
  {
    await SendAsync(CreateRequest(HttpMethod.Get, "/bff/security/csrf"));
  }

  [When("I request the customer profile")]
  public async Task WhenIRequestTheCustomerProfile()
  {
    using var request = CreateRequest(
      HttpMethod.Get,
      "/bff/customer/profile",
      includeTrustedIdentity: true);

    await SendAsync(request);
  }

  [When("I update the customer profile email to {string}")]
  public async Task WhenIUpdateTheCustomerProfileEmailTo(string email)
  {
    using var request = CreateRequest(
      HttpMethod.Put,
      "/bff/customer/profile",
      includeTrustedIdentity: true);

    if (!string.IsNullOrWhiteSpace(_csrfToken))
    {
      request.Headers.Add("x-csrf-token", _csrfToken);
    }

    request.Content = JsonContent.Create(new
    {
      profile = new
      {
        email,
        phone = "312-555-0100",
        streetAddress = "123 Main Street",
        addressLine2 = "Suite 200",
        city = "Chicago",
        state = "IL",
        zipCode = "60601",
      },
    });

    await SendAsync(request);
  }

  [When("I update the customer profile without a CSRF token")]
  public async Task WhenIUpdateTheCustomerProfileWithoutACsrfToken()
  {
    _csrfToken = null;
    await WhenIUpdateTheCustomerProfileEmailTo("user@example.com");
  }

  [When("I sync an authenticated BFF session for user {string} with email {string}")]
  public async Task WhenISyncAnAuthenticatedBffSessionForUserWithEmail(
    string userId,
    string email)
  {
    using var request = CreateRequest(HttpMethod.Post, "/bff/auth/session");
    request.Content = JsonContent.Create(new
    {
      idToken = "id-token-123",
      session = new
      {
        provider = "okta",
        status = "authenticated",
        isAuthenticated = true,
        assuranceLevel = "aal1",
        user = new
        {
          id = userId,
          displayName = "Session User",
          email,
        },
      },
      expiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds(),
      serverTokens = new
      {
        idToken = "id-token-123",
      },
    });

    await SendAsync(request);
    CaptureAuthSessionCookie();
  }

  [When("I read the BFF auth session")]
  public async Task WhenIReadTheBffAuthSession()
  {
    await SendAsync(CreateRequest(
      HttpMethod.Get,
      "/bff/auth/session",
      includeAuthSessionCookie: true));
  }

  [When("I touch the BFF auth session")]
  public async Task WhenITouchTheBffAuthSession()
  {
    await SendAsync(CreateRequest(
      HttpMethod.Post,
      "/bff/auth/session/touch",
      includeAuthSessionCookie: true));
  }

  [When("I request the BFF auth logout hint")]
  public async Task WhenIRequestTheBffAuthLogoutHint()
  {
    await SendAsync(CreateRequest(
      HttpMethod.Get,
      "/bff/auth/logout-hint",
      includeAuthSessionCookie: true));
  }

  [When("I clear the BFF auth session")]
  public async Task WhenIClearTheBffAuthSession()
  {
    await SendAsync(CreateRequest(
      HttpMethod.Delete,
      "/bff/auth/session",
      includeAuthSessionCookie: true));
  }

  [Then("the response status code should be {word}")]
  public void ThenTheResponseStatusCodeShouldBe(string statusCodeName)
  {
    Assert.NotNull(_response);
    var expectedStatusCode =
      Enum.Parse<HttpStatusCode>(statusCodeName, ignoreCase: true);

    Assert.Equal(expectedStatusCode, _response!.StatusCode);
  }

  [Then(
    "the health snapshot should report service {string} with status {string}")]
  public async Task ThenTheHealthSnapshotShouldReportServiceWithStatus(
    string service,
    string status)
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.Equal(service, payload.GetProperty("service").GetString());
    Assert.Equal(status, payload.GetProperty("status").GetString());
  }

  [Then("the response body should contain an OpenAPI document")]
  public async Task ThenTheResponseBodyShouldContainAnOpenApiDocument()
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.True(payload.TryGetProperty("openapi", out var openApi));
    Assert.False(string.IsNullOrWhiteSpace(openApi.GetString()));
  }

  [Then("the CSRF token contract should include a token")]
  public async Task ThenTheCsrfTokenContractShouldIncludeAToken()
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.True(payload.TryGetProperty("csrfToken", out var csrfToken));
    _csrfToken = csrfToken.GetString();

    Assert.False(string.IsNullOrWhiteSpace(_csrfToken));
  }

  [Then("the CSRF response should include an HTTP-only Lax cookie")]
  public void ThenTheCsrfResponseShouldIncludeAnHttpOnlyLaxCookie()
  {
    var csrfCookie = GetSetCookieHeader(CsrfCookieName);
    var normalizedCookie = csrfCookie.ToLowerInvariant();

    Assert.Contains($"{CsrfCookieName}=", csrfCookie);
    Assert.Contains("httponly", normalizedCookie);
    Assert.Contains("samesite=lax", normalizedCookie);
  }

  [Then("the CSRF cookie should be Secure")]
  public void ThenTheCsrfCookieShouldBeSecure()
  {
    var csrfCookie = GetSetCookieHeader(CsrfCookieName);

    Assert.Contains("secure", csrfCookie.ToLowerInvariant());
  }

  [Then("the customer profile email should be {string}")]
  public async Task ThenTheCustomerProfileEmailShouldBe(string email)
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.Equal(
      email,
      payload.GetProperty("profile").GetProperty("email").GetString());
  }

  [Then("the response should include a BFF auth session id")]
  public void ThenTheResponseShouldIncludeABffAuthSessionId()
  {
    Assert.False(string.IsNullOrWhiteSpace(_authSessionId));
    Assert.False(string.IsNullOrWhiteSpace(_authSessionCookieValue));
  }

  [Then("the auth session should be authenticated for user {string}")]
  public async Task ThenTheAuthSessionShouldBeAuthenticatedForUser(string userId)
  {
    var payload = await ReadJsonPayloadAsync();
    var session = payload.GetProperty("session");

    Assert.True(session.GetProperty("isAuthenticated").GetBoolean());
    Assert.Equal(userId, session.GetProperty("user").GetProperty("id").GetString());
  }

  [Then("the auth session touch should succeed")]
  public async Task ThenTheAuthSessionTouchShouldSucceed()
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.True(payload.GetProperty("touched").GetBoolean());
    Assert.True(payload.GetProperty("session").GetProperty("isAuthenticated").GetBoolean());
  }

  [Then("the logout hint id token should be {string}")]
  public async Task ThenTheLogoutHintIdTokenShouldBe(string idToken)
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.Equal(idToken, payload.GetProperty("idToken").GetString());
  }

  [Then("the auth session should be unauthenticated")]
  public async Task ThenTheAuthSessionShouldBeUnauthenticated()
  {
    var payload = await ReadJsonPayloadAsync();
    var session = payload.GetProperty("session");

    Assert.False(session.GetProperty("isAuthenticated").GetBoolean());
    Assert.Equal("unauthenticated", session.GetProperty("status").GetString());
  }

  public void Dispose()
  {
    _jsonPayload?.Dispose();
    _response?.Dispose();
    _client.Dispose();
    _factory?.Dispose();
  }

  private async Task SendAsync(HttpRequestMessage request)
  {
    _jsonPayload?.Dispose();
    _jsonPayload = null;
    _response?.Dispose();
    _response = await _client.SendAsync(request);
    _setCookieHeaders = _response.Headers.TryGetValues(
      "Set-Cookie",
      out var setCookieHeaders)
        ? setCookieHeaders.ToArray()
        : [];
  }

  private HttpRequestMessage CreateRequest(
    HttpMethod method,
    string uri,
    bool includeTrustedIdentity = false,
    bool includeAuthSessionCookie = false)
  {
    var request = new HttpRequestMessage(method, uri);

    foreach (var (name, value) in _defaultHeaders)
    {
      request.Headers.Add(name, value);
    }

    var proxySecret =
      Environment.GetEnvironmentVariable("ACME_BFF_TRUSTED_PROXY_SECRET")?.Trim();

    if (!string.IsNullOrWhiteSpace(proxySecret))
    {
      request.Headers.Add("x-acme-bff-proxy-secret", proxySecret);
    }

    if (includeTrustedIdentity)
    {
      foreach (var (name, value) in _trustedIdentityHeaders)
      {
        if (!request.Headers.Contains(name))
        {
          request.Headers.Add(name, value);
        }
      }
    }

    if (includeAuthSessionCookie && !string.IsNullOrWhiteSpace(_authSessionCookieValue))
    {
      request.Headers.Add(
        "Cookie",
        $"{AuthSessionCookieName}={_authSessionCookieValue}");
    }

    return request;
  }

  private void CaptureAuthSessionCookie()
  {
    Assert.NotNull(_response);

    Assert.True(_response!.Headers.TryGetValues(
      "x-acme-auth-session-id",
      out var sessionIdValues));

    _authSessionId = Assert.Single(sessionIdValues);
    _authSessionCookieValue = CreateSignedSessionCookie(_authSessionId);
  }

  private async Task<JsonElement> ReadJsonPayloadAsync()
  {
    Assert.NotNull(_response);

    if (_jsonPayload is not null)
    {
      return _jsonPayload.RootElement;
    }

    var responseBody = await _response!.Content.ReadAsStringAsync();
    _jsonPayload = JsonDocument.Parse(responseBody);

    return _jsonPayload.RootElement;
  }

  private string GetSetCookieHeader(string cookieName)
  {
    var cookieHeader = _setCookieHeaders.FirstOrDefault(
      header => header.StartsWith($"{cookieName}=", StringComparison.Ordinal));

    Assert.False(string.IsNullOrWhiteSpace(cookieHeader));

    return cookieHeader!;
  }

  private static string CreateSignedSessionCookie(string sessionId)
  {
    return CreateSignedCookie(new { sessionId });
  }

  private static string CreateSignedCookie(object payload)
  {
    var payloadPart = ToBase64Url(
      Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
    using var hmac = new HMACSHA256(
      Encoding.UTF8.GetBytes(ResolveSessionSecret()));
    var signaturePart = ToBase64Url(
      hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadPart)));

    return $"{payloadPart}.{signaturePart}";
  }

  private static string ResolveSessionSecret()
  {
    var configuredSecret =
      Environment.GetEnvironmentVariable("ACME_WEB_SESSION_SECRET")?.Trim();

    return string.IsNullOrWhiteSpace(configuredSecret)
      ? DevelopmentSessionSecret
      : configuredSecret;
  }

  private static string ToBase64Url(byte[] value)
  {
    return Convert.ToBase64String(value)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }
}

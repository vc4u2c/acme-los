using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Reqnroll;
using Xunit;

namespace Acme.Los.Bff.Api.E2E.StepDefinitions;

[Binding]
public sealed class BffApiSteps : IDisposable
{
  private readonly HttpClient _client;
  private readonly WebApplicationFactory<global::Program>? _factory;
  private readonly Dictionary<string, string> _trustedIdentityHeaders = [];
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

  [When("I request the BFF health snapshot")]
  public async Task WhenIRequestTheBffHealthSnapshot()
  {
    await SendAsync(new HttpRequestMessage(HttpMethod.Get, "/bff/health"));
  }

  [When("I request the customer profile")]
  public async Task WhenIRequestTheCustomerProfile()
  {
    using var request =
      new HttpRequestMessage(HttpMethod.Get, "/bff/customer/profile");

    foreach (var (name, value) in _trustedIdentityHeaders)
    {
      request.Headers.Add(name, value);
    }

    await SendAsync(request);
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

  [Then("the customer profile email should be {string}")]
  public async Task ThenTheCustomerProfileEmailShouldBe(string email)
  {
    var payload = await ReadJsonPayloadAsync();

    Assert.Equal(
      email,
      payload.GetProperty("profile").GetProperty("email").GetString());
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
}

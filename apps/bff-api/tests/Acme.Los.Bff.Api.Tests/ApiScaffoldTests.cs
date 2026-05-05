using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.State;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Acme.Los.Bff.Api.Tests;

public sealed class ApiScaffoldTests : IClassFixture<WebApplicationFactory<global::Program>>
{
  private readonly WebApplicationFactory<global::Program> _factory;

  public ApiScaffoldTests(WebApplicationFactory<global::Program> factory)
  {
    _factory = factory;
  }

  [Fact]
  public async Task GetLiveness_ReturnsHealthy()
  {
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/health/live");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var body = await response.Content.ReadAsStringAsync();
    Assert.Contains("Healthy", body);
  }

  [Fact]
  public async Task GetBffHealth_ReturnsSnapshot()
  {
    using var client = _factory.CreateClient();

    var snapshot = await client.GetFromJsonAsync<HealthSnapshot>("/bff/health");

    Assert.NotNull(snapshot);
    Assert.Equal("ok", snapshot!.Status);
    Assert.Equal("bff-api", snapshot.Service);
    Assert.False(string.IsNullOrWhiteSpace(snapshot.Environment));
  }

  [Fact]
  public async Task GetBffCsrf_IssuesTokenAndCookie()
  {
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/bff/security/csrf");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.Contains(
        response.Headers,
        header => string.Equals(header.Key, "Set-Cookie", StringComparison.OrdinalIgnoreCase));

    var issuedToken = await response.Content.ReadFromJsonAsync<IssueCsrfTokenResponse>();

    Assert.NotNull(issuedToken);
    Assert.False(string.IsNullOrWhiteSpace(issuedToken!.CsrfToken));
  }

  [Fact]
  public async Task GetBffAuthSession_ReturnsUnauthenticatedContract()
  {
    using var client = _factory.CreateClient();

    var sessionResponse =
        await client.GetFromJsonAsync<GetWebAuthSessionResponse>("/bff/auth/session");

    Assert.NotNull(sessionResponse);
    Assert.False(sessionResponse!.Session.IsAuthenticated);
    Assert.Equal("unauthenticated", sessionResponse.Session.Status);
    Assert.Null(sessionResponse.SessionTiming);
  }

  [Fact]
  public async Task GetReservedBffCustomerRoute_ReturnsProblemDetails()
  {
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/bff/customer/profile");

    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

    var error =
      await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();

    Assert.NotNull(error);
    Assert.Equal("Authentication is required.", error!["error"]);
  }

  [Fact]
  public async Task GetBffCustomerProfile_WithTrustedIdentity_ReturnsDefaultProfile()
  {
    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/customer/profile");

    request.Headers.Add("x-acme-authenticated-user-id", "user-123");
    request.Headers.Add("x-acme-authenticated-user-email", "user@example.com");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<GetCustomerProfileResponse>();

    Assert.NotNull(payload);
    Assert.Equal("user@example.com", payload!.Profile.Email);
    Assert.Equal(string.Empty, payload.Profile.Phone);
  }

  [Fact]
  public async Task GetBffCustomerProfile_InProductionWithoutProxySecret_RejectsTrustedHeaders()
  {
    var originalProxySecret =
      Environment.GetEnvironmentVariable("ACME_BFF_TRUSTED_PROXY_SECRET");

    try
    {
      Environment.SetEnvironmentVariable("ACME_BFF_TRUSTED_PROXY_SECRET", null);
      using var factory =
        _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
      using var client = factory.CreateClient();
      using var request = new HttpRequestMessage(
        HttpMethod.Get,
        "/bff/customer/profile");

      request.Headers.Add("x-acme-authenticated-user-id", "user-123");
      request.Headers.Add("x-acme-authenticated-user-email", "user@example.com");

      using var response = await client.SendAsync(request);

      Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
    finally
    {
      Environment.SetEnvironmentVariable(
        "ACME_BFF_TRUSTED_PROXY_SECRET",
        originalProxySecret);
    }
  }

  [Fact]
  public async Task GetBffCustomerProfile_InProductionWithProxySecret_AcceptsTrustedHeaders()
  {
    var originalProxySecret =
      Environment.GetEnvironmentVariable("ACME_BFF_TRUSTED_PROXY_SECRET");

    try
    {
      Environment.SetEnvironmentVariable(
        "ACME_BFF_TRUSTED_PROXY_SECRET",
        "proxy-secret-123");
      using var factory =
        _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
      using var client = factory.CreateClient();
      using var request = new HttpRequestMessage(
        HttpMethod.Get,
        "/bff/customer/profile");

      request.Headers.Add("x-acme-bff-proxy-secret", "proxy-secret-123");
      request.Headers.Add("x-acme-authenticated-user-id", "user-123");
      request.Headers.Add("x-acme-authenticated-user-email", "user@example.com");

      using var response = await client.SendAsync(request);

      Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
    finally
    {
      Environment.SetEnvironmentVariable(
        "ACME_BFF_TRUSTED_PROXY_SECRET",
        originalProxySecret);
    }
  }

  [Fact]
  public async Task PutBffCustomerProfile_WithTrustedIdentityAndCsrf_PersistsProfile()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var updateRequest = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/customer/profile");

    updateRequest.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    updateRequest.Headers.Add("x-acme-authenticated-user-id", "user-123");
    updateRequest.Headers.Add("x-acme-authenticated-user-email", "user@example.com");
    updateRequest.Content = JsonContent.Create(
      new UpdateCustomerProfileRequest(
        new CustomerProfile(
          "",
          "312-555-0100",
          "123 Main Street",
          "Suite 200",
          "Chicago",
          "IL",
          "60601")));

    using var updateResponse = await client.SendAsync(updateRequest);

    Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

    var updated =
      await updateResponse.Content.ReadFromJsonAsync<UpdateCustomerProfileResponse>();

    Assert.NotNull(updated);
    Assert.Equal("user@example.com", updated!.Profile.Email);
    Assert.Equal("312-555-0100", updated.Profile.Phone);

    using var readRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/customer/profile");

    readRequest.Headers.Add("x-acme-authenticated-user-id", "user-123");
    readRequest.Headers.Add("x-acme-authenticated-user-email", "user@example.com");

    using var readResponse = await client.SendAsync(readRequest);
    var reloaded =
      await readResponse.Content.ReadFromJsonAsync<GetCustomerProfileResponse>();

    Assert.NotNull(reloaded);
    Assert.Equal("123 Main Street", reloaded!.Profile.StreetAddress);
    Assert.Equal("Chicago", reloaded.Profile.City);
  }

  [Fact]
  public async Task GetBffApplicationStep_WithTrustedIdentityAndNoState_ReturnsNullStepState()
  {
    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/application/steps/personal-info");

    request.Headers.Add("x-acme-authenticated-user-id", "application-user-001");
    request.Headers.Add("x-acme-authenticated-customer-id", "customer-001");
    request.Headers.Add("x-acme-authenticated-lead-id", "lead-001");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<GetApplicationStepResponse>();

    Assert.NotNull(payload);
    Assert.Null(payload!.StepState);
  }

  [Fact]
  public async Task PutBffApplicationStep_WithTrustedIdentityAndCsrf_PersistsState()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/application/steps/personal-info");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    request.Headers.Add("x-acme-authenticated-user-id", "application-user-002");
    request.Headers.Add("x-acme-authenticated-customer-id", "customer-002");
    request.Headers.Add("x-acme-authenticated-lead-id", "lead-002");
    request.Content = JsonContent.Create(
      new SaveApplicationStepRequest(
        new Dictionary<string, JsonElement>
        {
          ["firstName"] = JsonSerializer.SerializeToElement("Taylor"),
          ["annualIncome"] = JsonSerializer.SerializeToElement(95000),
        }));

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<SaveApplicationStepResponse>();

    Assert.NotNull(payload);
    Assert.Equal("personal-info", payload!.StepState.Step);
    Assert.Equal("Taylor", payload.StepState.Payload["firstName"].GetString());
    Assert.Equal(95000, payload.StepState.Payload["annualIncome"].GetInt32());
    Assert.Equal("personal-info", payload.StepState.Summary.CurrentStep);
    Assert.Equal(["personal-info"], payload.StepState.Summary.CompletedSteps);
    Assert.Equal("customer-002", payload.StepState.Summary.CustomerId);
    Assert.Equal("lead-002", payload.StepState.Summary.LeadId);
  }

  [Fact]
  public async Task PostBffApplicationSubmit_WithTrustedIdentityAndCsrf_SubmitsAndClearsState()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var saveRequest = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/application/steps/personal-info");

    saveRequest.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    saveRequest.Headers.Add("x-acme-authenticated-user-id", "application-user-003");
    saveRequest.Headers.Add("x-acme-authenticated-customer-id", "customer-003");
    saveRequest.Headers.Add("x-acme-authenticated-lead-id", "lead-003");
    saveRequest.Content = JsonContent.Create(
      new SaveApplicationStepRequest(
        new Dictionary<string, JsonElement>
        {
          ["firstName"] = JsonSerializer.SerializeToElement("Jordan"),
        }));

    using var saveResponse = await client.SendAsync(saveRequest);

    Assert.Equal(HttpStatusCode.OK, saveResponse.StatusCode);

    using var submitRequest = new HttpRequestMessage(
      HttpMethod.Post,
      "/bff/application/submit");

    submitRequest.Headers.Add("x-csrf-token", csrfToken.CsrfToken);
    submitRequest.Headers.Add("x-acme-authenticated-user-id", "application-user-003");
    submitRequest.Headers.Add("x-acme-authenticated-customer-id", "customer-003");
    submitRequest.Headers.Add("x-acme-authenticated-lead-id", "lead-003");
    submitRequest.Content = JsonContent.Create(
      new SubmitApplicationRequest(
        "funding",
        new Dictionary<string, JsonElement>
        {
          ["acceptedTerms"] = JsonSerializer.SerializeToElement(true),
        }));

    using var submitResponse = await client.SendAsync(submitRequest);

    Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);

    var submitted =
      await submitResponse.Content.ReadFromJsonAsync<SubmitApplicationResponse>();

    Assert.NotNull(submitted);
    Assert.Equal("funding", submitted!.Summary.CurrentStep);
    Assert.Equal(
      ["personal-info", "funding"],
      submitted.Summary.CompletedSteps);
    Assert.Equal("customer-003", submitted.Summary.CustomerId);
    Assert.Equal("lead-003", submitted.Summary.LeadId);

    using var readRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/application/steps/funding");

    readRequest.Headers.Add("x-acme-authenticated-user-id", "application-user-003");
    readRequest.Headers.Add("x-acme-authenticated-customer-id", "customer-003");
    readRequest.Headers.Add("x-acme-authenticated-lead-id", "lead-003");

    using var readResponse = await client.SendAsync(readRequest);
    var reloaded =
      await readResponse.Content.ReadFromJsonAsync<GetApplicationStepResponse>();

    Assert.NotNull(reloaded);
    Assert.Null(reloaded!.StepState);
  }

  [Fact]
  public async Task GetReservedBffAuthLoginRoute_ReturnsProblemDetails()
  {
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/bff/auth/login");

    Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
    Assert.Equal(
      "application/problem+json",
      response.Content.Headers.ContentType?.MediaType);
  }

  [Fact]
  public async Task PostBffAuthSessionTouch_WithValidCsrfAndNoSession_ReturnsUnauthorized()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
        await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
        HttpMethod.Post,
        "/bff/auth/session/touch");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

    var touchResponse =
        await response.Content.ReadFromJsonAsync<TouchWebAuthSessionResponse>();

    Assert.NotNull(touchResponse);
    Assert.False(touchResponse!.Touched);
    Assert.False(touchResponse.Session.IsAuthenticated);
  }

  [Fact]
  public async Task DeleteBffAuthSession_WithValidCsrf_ClearsSessionContract()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
        await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
        HttpMethod.Delete,
        "/bff/auth/session");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var clearResponse =
        await response.Content.ReadFromJsonAsync<ClearWebAuthSessionResponse>();

    Assert.NotNull(clearResponse);
    Assert.True(clearResponse!.Cleared);
    Assert.False(clearResponse.Session.IsAuthenticated);
  }

  [Fact]
  public async Task GetMissingRoute_ReturnsProblemDetailsPayload()
  {
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/bff/not-found");

    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    Assert.Equal(
      "application/problem+json",
      response.Content.Headers.ContentType?.MediaType);
  }

  [Fact]
  public async Task GetOpenApiDocument_InDevelopment_ReturnsDocument()
  {
    using var factory = _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
    using var client = factory.CreateClient();
    using var response = await client.GetAsync("/openapi/v1.json");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var body = await response.Content.ReadAsStringAsync();
    Assert.Contains("\"openapi\"", body);
  }

  [Fact]
  public void StateStoreOptions_DefaultToInMemoryWhenRedisIsNotConfigured()
  {
    var options = BffStateStoreOptions.FromConfiguration(new ConfigurationBuilder().Build());

    Assert.Equal(BffStateStoreMode.InMemory, options.Mode);
    Assert.Equal(BffRedisAuthMode.ConnectionString, options.RedisAuthMode);
    Assert.Equal("redis://127.0.0.1:6379", options.RedisUrl);
    Assert.Equal("acme-los:web", options.RedisKeyPrefix);
  }

  [Fact]
  public void StateStoreOptions_UseRedisConnectionStringWhenRequested()
  {
    var options = BffStateStoreOptions.FromConfiguration(
      new ConfigurationBuilder()
        .AddInMemoryCollection(
          new Dictionary<string, string?>
          {
            ["ACME_WEB_STATE_STORE"] = "redis",
            ["ACME_REDIS_URL"] = "redis://127.0.0.1:6381",
          })
        .Build());

    Assert.Equal(BffStateStoreMode.Redis, options.Mode);
    Assert.Equal(BffRedisAuthMode.ConnectionString, options.RedisAuthMode);
    Assert.Equal("redis://127.0.0.1:6381", options.RedisUrl);
  }

  [Fact]
  public void StateStoreOptions_UseRedisEntraWhenHostIsConfigured()
  {
    var options = BffStateStoreOptions.FromConfiguration(
      new ConfigurationBuilder()
        .AddInMemoryCollection(
          new Dictionary<string, string?>
          {
            ["ACME_REDIS_HOST"] = "cache-name.centralus.redis.azure.net",
            ["ACME_REDIS_PORT"] = "10000",
            ["ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID"] = "00000000-0000-0000-0000-000000000001",
          })
        .Build());

    Assert.Equal(BffStateStoreMode.Redis, options.Mode);
    Assert.Equal(BffRedisAuthMode.Entra, options.RedisAuthMode);
    Assert.Equal("cache-name.centralus.redis.azure.net", options.RedisHost);
    Assert.Equal(10000, options.RedisPort);
    Assert.Equal(
      "00000000-0000-0000-0000-000000000001",
      options.ManagedIdentityClientId);
  }
}

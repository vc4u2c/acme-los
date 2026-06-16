using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Features.AccountSecurity;
using Acme.Los.Bff.Api.Infrastructure.Auth;
using Acme.Los.Bff.Api.Infrastructure.Okta;
using Acme.Los.Bff.Api.Infrastructure.State;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;

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
  public async Task GetBffHealth_EchoesCorrelationIdHeader()
  {
    const string correlationId = "931f0597-d984-42e3-a652-e64fe3b719ef";

    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(HttpMethod.Get, "/bff/health");

    request.Headers.Add("x-correlation-id", correlationId.ToUpperInvariant());

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.True(
      response.Headers.TryGetValues("x-correlation-id", out var values));
    Assert.Contains(correlationId, values);
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
  public async Task GetBffHealth_ReturnsConfiguredVersionAndBuild()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_VERSION"] = "1.2.3",
        ["APP_BUILD_ID"] = "abc12345",
      });
    using var client = _factory.CreateClient();

    var snapshot = await client.GetFromJsonAsync<HealthSnapshot>("/bff/health");

    Assert.NotNull(snapshot);
    Assert.Equal("1.2.3", snapshot!.Version);
    Assert.Equal("abc12345", snapshot.Build);
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
  public async Task GetBffCsrf_UsesSecureCookieBehindForwardedHttps()
  {
    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/security/csrf");

    request.Headers.Add("x-forwarded-proto", "https");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.Contains(
      response.Headers,
      header =>
        string.Equals(header.Key, "Set-Cookie", StringComparison.OrdinalIgnoreCase)
        && header.Value.Any(value => value.Contains(
          "secure",
          StringComparison.OrdinalIgnoreCase)));
  }

  [Fact]
  public async Task DeleteBffAuthSession_UsesSecureCookieBehindForwardedHttps()
  {
    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Delete,
      "/bff/auth/session");

    request.Headers.Add("x-forwarded-proto", "https");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.Contains(
      response.Headers,
      header =>
        string.Equals(header.Key, "Set-Cookie", StringComparison.OrdinalIgnoreCase)
        && header.Value.Any(value => value.Contains(
          "secure",
          StringComparison.OrdinalIgnoreCase)));
  }

  [Fact]
  public async Task GetBffCsrf_ReissuesSignedFacadeCookieAsBffToken()
  {
    const string csrfToken = "csrf-token-123";

    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/security/csrf");

    request.Headers.Add(
      "Cookie",
      $"acme-los.csrf-token={CreateSignedCookie(new { token = csrfToken })}");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var issuedToken =
        await response.Content.ReadFromJsonAsync<IssueCsrfTokenResponse>();

    Assert.NotNull(issuedToken);
    Assert.Equal(csrfToken, issuedToken!.CsrfToken);
    Assert.Contains(
        response.Headers,
        header =>
            string.Equals(header.Key, "Set-Cookie", StringComparison.OrdinalIgnoreCase)
            && header.Value.Any(value => value.Contains(
                $"acme-los.csrf-token={csrfToken}",
                StringComparison.Ordinal)));
  }

  [Fact]
  public async Task PostBffDiagnosticsTrace_WithCsrf_ReturnsAcceptedTraceResponse()
  {
    const string correlationId = "931f0597-d984-42e3-a652-e64fe3b719ef";
    const string traceId = "0123456789abcdef0123456789abcdef";
    const string parentSpanId = "0123456789abcdef";
    const string traceFlags = "01";
    const string traceparent = $"00-{traceId}-{parentSpanId}-{traceFlags}";

    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
      HttpMethod.Post,
      "/bff/diagnostics/trace");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    request.Headers.Add("x-correlation-id", correlationId.ToUpperInvariant());
    request.Headers.Add("traceparent", traceparent.ToUpperInvariant());
    request.Content = JsonContent.Create(
      new DiagnosticsTraceRequest("/logging-demo"));

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    Assert.True(
      response.Headers.TryGetValues("x-correlation-id", out var values));
    Assert.Contains(correlationId, values);

    var payload =
      await response.Content.ReadFromJsonAsync<DiagnosticsTraceResponse>();

    Assert.NotNull(payload);
    Assert.Equal(correlationId, payload!.CorrelationId);
    Assert.Equal("diagnostics.trace.bff.received", payload.EventName);
    Assert.Equal("bff-api", payload.HandledBy);
    Assert.Equal("/logging-demo", payload.Route);
    Assert.Equal(traceparent, payload.IncomingTraceparent);
    Assert.Equal(parentSpanId, payload.ParentSpanId);
    Assert.Equal(traceId, payload.TraceId);
    Assert.Equal(traceFlags, payload.TraceFlags);
    Assert.Equal(["diagnostics.trace.bff.received"], payload.EmittedEvents);
    Assert.StartsWith($"00-{traceId}-", payload.ServerTraceparent);
  }

  [Fact]
  public async Task PostBffDiagnosticsTrace_WithMissingCsrf_ReturnsBadRequest()
  {
    using var client = _factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Post,
      "/bff/diagnostics/trace");

    request.Headers.Add(
      "x-correlation-id",
      "931f0597-d984-42e3-a652-e64fe3b719ef");
    request.Headers.Add(
      "traceparent",
      "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");
    request.Content = JsonContent.Create(new DiagnosticsTraceRequest("/logging-demo"));

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
  }

  [Fact]
  public async Task PostBffDiagnosticsTrace_WithUnexpectedRoute_ReturnsBadRequest()
  {
    const string correlationId = "931f0597-d984-42e3-a652-e64fe3b719ef";
    const string traceparent =
      "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";

    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
      HttpMethod.Post,
      "/bff/diagnostics/trace");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    request.Headers.Add("x-correlation-id", correlationId);
    request.Headers.Add("traceparent", traceparent);
    request.Content =
      JsonContent.Create(new DiagnosticsTraceRequest("/unexpected-route"));

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
  }

  [Fact]
  public async Task PostBffDiagnosticsTrace_InProductionWithoutProxySecret_ReturnsForbidden()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_TRUSTED_PROXY_SECRET"] = null,
      });
    using var factory =
      _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
    using var client = factory.CreateClient();
    using var response = await client.PostAsJsonAsync(
      "/bff/diagnostics/trace",
      new DiagnosticsTraceRequest("/logging-demo"));

    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
  }

  [Fact]
  public async Task GetBffSecurityInspector_WithTrustedSession_ReturnsStoredTokens()
  {
    using var client = _factory.CreateClient();
    var idToken = CreateUnsignedJwt(new
    {
      sub = "user-123",
      email = "user@example.com",
    });
    var accessToken = CreateUnsignedJwt(new
    {
      sub = "user-123",
      scp = new[] { "openid", "profile" },
    });
    var expiresAt = (int)DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
    using var syncResponse = await client.PostAsJsonAsync(
      "/bff/auth/session",
      new SyncWebAuthSessionRequest(
        idToken,
        Session: new WebAuthSession(
          "okta",
          "authenticated",
          true,
          "aal1",
          new WebAuthSessionUser(
            "user-123",
            "User Test",
            "user@example.com")),
        ExpiresAt: expiresAt,
        ServerTokens: new WebAuthSessionTokenSet(
          idToken,
          accessToken,
          "refresh-token-123",
          "Bearer",
          "openid profile",
          3600)));

    Assert.Equal(HttpStatusCode.OK, syncResponse.StatusCode);
    Assert.True(
      syncResponse.Headers.TryGetValues(
        "x-acme-auth-session-id",
        out var sessionIdValues));

    var sessionId = Assert.Single(sessionIdValues);
    using var inspectorRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/security/inspector");

    inspectorRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={CreateSignedSessionCookie(sessionId)}");

    using var inspectorResponse = await client.SendAsync(inspectorRequest);

    Assert.Equal(HttpStatusCode.OK, inspectorResponse.StatusCode);

    var snapshot =
      await inspectorResponse.Content.ReadFromJsonAsync<SecurityInspectorServerSnapshot>();

    Assert.NotNull(snapshot);
    Assert.Equal("okta", snapshot!.Provider);
    Assert.Equal("in-memory", snapshot.StateStoreMode);
    Assert.NotNull(snapshot.StoredSession);
    Assert.Equal(
      idToken,
      snapshot.StoredSession!.Tokens.IdToken.Raw);
    Assert.Equal(
      accessToken,
      snapshot.StoredSession.Tokens.AccessToken.Raw);
    Assert.Equal(
      "refresh-token-123",
      snapshot.StoredSession.Tokens.RefreshToken);
    Assert.Equal(
      "user-123",
      ((JsonElement)snapshot.StoredSession.Tokens.IdToken.Claims!["sub"]!)
        .GetString());
  }

  [Fact]
  public async Task GetBffSecurityInspector_WhenDisabled_ReturnsNotFound()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_ENABLE_SECURITY_INSPECTOR"] = "false",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync("/bff/security/inspector");

    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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
  public async Task BffAuthSession_CanSyncReadTouchAndReturnLogoutHint()
  {
    using var client = _factory.CreateClient();
    var expiresAt = (int)DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
    using var syncResponse = await client.PostAsJsonAsync(
      "/bff/auth/session",
      new SyncWebAuthSessionRequest(
        "id-token-123",
        Session: new WebAuthSession(
          "okta",
          "authenticated",
          true,
          "aal1",
          new WebAuthSessionUser(
            "user-123",
            "User Test",
            "user@example.com")),
        ExpiresAt: expiresAt,
        ServerTokens: new WebAuthSessionTokenSet("id-token-123")));

    Assert.Equal(HttpStatusCode.OK, syncResponse.StatusCode);
    Assert.True(
      syncResponse.Headers.TryGetValues(
        "x-acme-auth-session-id",
        out var sessionIdValues));
    Assert.True(
      syncResponse.Headers.TryGetValues(
        "x-acme-auth-session-max-age",
        out var maxAgeValues));

    var sessionId = Assert.Single(sessionIdValues);
    var maxAge = Assert.Single(maxAgeValues);

    Assert.False(string.IsNullOrWhiteSpace(sessionId));
    Assert.True(int.Parse(maxAge) > 0);

    var sessionCookie = CreateSignedSessionCookie(sessionId);
    using var readRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/session");

    readRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={sessionCookie}");

    using var readResponse = await client.SendAsync(readRequest);
    var readPayload =
      await readResponse.Content.ReadFromJsonAsync<GetWebAuthSessionResponse>();

    Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
    Assert.NotNull(readPayload);
    Assert.True(readPayload!.Session.IsAuthenticated);
    Assert.Equal("user-123", readPayload.Session.User?.Id);

    using var touchRequest = new HttpRequestMessage(
      HttpMethod.Post,
      "/bff/auth/session/touch");

    touchRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={sessionCookie}");

    using var touchResponse = await client.SendAsync(touchRequest);
    var touchPayload =
      await touchResponse.Content.ReadFromJsonAsync<TouchWebAuthSessionResponse>();

    Assert.Equal(HttpStatusCode.OK, touchResponse.StatusCode);
    Assert.NotNull(touchPayload);
    Assert.True(touchPayload!.Touched);

    using var logoutHintRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/logout-hint");

    logoutHintRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={sessionCookie}");

    using var logoutHintResponse = await client.SendAsync(logoutHintRequest);
    var logoutHint =
      await logoutHintResponse.Content.ReadFromJsonAsync<GetWebAuthLogoutHintResponse>();

    Assert.Equal(HttpStatusCode.OK, logoutHintResponse.StatusCode);
    Assert.Equal("id-token-123", logoutHint!.IdToken);
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
  public void BffServiceAuthenticationOptions_WithAudienceList_AcceptsUriAndClientIdAudiences()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_SERVICE_AUTH_MODE"] = "entra",
        ["ACME_BFF_SERVICE_AUTH_TENANT_ID"] = "00000000-0000-0000-0000-000000000001",
        ["ACME_BFF_SERVICE_AUTH_AUDIENCE"] = "api://acme-los-bff,bff-api-client-id",
        ["ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS"] = "web-client-id",
        ["ACME_BFF_SERVICE_AUTH_ALLOWED_OBJECT_IDS"] = "web-object-id",
      });

    var options = BffServiceAuthenticationOptions.FromEnvironment();

    Assert.True(options.IsFullyConfigured);
    Assert.Contains("api://acme-los-bff", options.Audiences);
    Assert.Contains("bff-api-client-id", options.Audiences);
    Assert.Contains("web-client-id", options.AllowedClientIds);
    Assert.Contains("web-object-id", options.AllowedObjectIds);
  }

  [Fact]
  public async Task GetBffAuthSession_WithServiceAuthRequiredAndMissingBearer_ReturnsForbidden()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_SERVICE_AUTH_MODE"] = "entra",
        ["ACME_BFF_SERVICE_AUTH_TENANT_ID"] = "00000000-0000-0000-0000-000000000001",
        ["ACME_BFF_SERVICE_AUTH_AUDIENCE"] = "api://acme-los-bff",
        ["ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS"] = "web-client-id",
        ["ACME_BFF_TRUSTED_PROXY_SECRET"] = "proxy-secret-123",
      });
    using var factory =
      _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
    using var client = factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/session");

    request.Headers.Add("x-acme-bff-proxy-secret", "proxy-secret-123");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
  }

  [Fact]
  public async Task GetBffAuthSession_WithServiceAuthAndProxySecret_AcceptsTrustedBoundary()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_SERVICE_AUTH_MODE"] = "entra",
        ["ACME_BFF_SERVICE_AUTH_TENANT_ID"] = "00000000-0000-0000-0000-000000000001",
        ["ACME_BFF_SERVICE_AUTH_AUDIENCE"] = "api://acme-los-bff",
        ["ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS"] = "web-client-id",
        ["ACME_BFF_TRUSTED_PROXY_SECRET"] = "proxy-secret-123",
      });
    using var factory =
      _factory.WithWebHostBuilder(builder =>
      {
        builder.UseEnvironment("Production");
        builder.ConfigureServices(services =>
        {
          services.AddSingleton<IBffServiceTokenValidator>(
            new AcceptingBffServiceTokenValidator());
        });
      });
    using var client = factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/session");

    request.Headers.Authorization =
      new System.Net.Http.Headers.AuthenticationHeaderValue(
        "Bearer",
        "accepted-service-token");
    request.Headers.Add("x-acme-bff-proxy-secret", "proxy-secret-123");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  [Fact]
  public async Task GetBffAuthSession_WithServiceAuthAndMissingProxySecret_ReturnsForbidden()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_BFF_SERVICE_AUTH_MODE"] = "entra",
        ["ACME_BFF_SERVICE_AUTH_TENANT_ID"] = "00000000-0000-0000-0000-000000000001",
        ["ACME_BFF_SERVICE_AUTH_AUDIENCE"] = "api://acme-los-bff",
        ["ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS"] = "web-client-id",
        ["ACME_BFF_TRUSTED_PROXY_SECRET"] = "proxy-secret-123",
      });
    using var factory =
      _factory.WithWebHostBuilder(builder =>
      {
        builder.UseEnvironment("Production");
        builder.ConfigureServices(services =>
        {
          services.AddSingleton<IBffServiceTokenValidator>(
            new AcceptingBffServiceTokenValidator());
        });
      });
    using var client = factory.CreateClient();
    using var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/session");

    request.Headers.Authorization =
      new System.Net.Http.Headers.AuthenticationHeaderValue(
        "Bearer",
        "accepted-service-token");

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
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
  public async Task GetBffCustomerProfile_WhenOktaEmailChanges_SynchronizesStoredProfile()
  {
    using var client = _factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var updateRequest = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/customer/profile");

    updateRequest.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    updateRequest.Headers.Add("x-acme-authenticated-user-id", "user-email-sync");
    updateRequest.Headers.Add(
      "x-acme-authenticated-user-email",
      "old@example.com");
    updateRequest.Content = JsonContent.Create(
      new UpdateCustomerProfileRequest(
        new CustomerProfile(
          "",
          "312-555-0100",
          "123 Main Street",
          "",
          "Chicago",
          "IL",
          "60601")));

    using var updateResponse = await client.SendAsync(updateRequest);

    Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

    using var readRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/customer/profile");

    readRequest.Headers.Add("x-acme-authenticated-user-id", "user-email-sync");
    readRequest.Headers.Add(
      "x-acme-authenticated-user-email",
      "new@example.com");

    using var readResponse = await client.SendAsync(readRequest);
    var reloaded =
      await readResponse.Content.ReadFromJsonAsync<GetCustomerProfileResponse>();

    Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
    Assert.NotNull(reloaded);
    Assert.Equal("new@example.com", reloaded!.Profile.Email);
    Assert.Equal("312-555-0100", reloaded.Profile.Phone);
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
  public async Task PutBffApplicationStep_WithOktaIdentityAndNoCustomerId_UsesBffWritebackCustomerId()
  {
    var writebackService = new CapturingCustomerIdWritebackService(
      "sample-customer-123456789abc");
    using var factory = _factory.WithWebHostBuilder(builder =>
      builder.ConfigureServices(services =>
      {
        services.RemoveAll<IOktaCustomerIdWritebackService>();
        services.AddSingleton<IOktaCustomerIdWritebackService>(writebackService);
      }));
    using var client = factory.CreateClient();
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var request = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/application/steps/personal-info");

    request.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    request.Headers.Add("x-acme-auth-provider", "okta");
    request.Headers.Add("x-acme-authenticated-user-id", "application-user-004");
    request.Content = JsonContent.Create(
      new SaveApplicationStepRequest(
        new Dictionary<string, JsonElement>
        {
          ["firstName"] = JsonSerializer.SerializeToElement("Ada"),
        }));

    using var response = await client.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<SaveApplicationStepResponse>();

    Assert.NotNull(payload);
    Assert.Equal(
      "sample-customer-123456789abc",
      payload!.StepState.Summary.CustomerId);
    Assert.Equal("okta", writebackService.Provider);
    Assert.Equal("application-user-004", writebackService.UserId);
    Assert.Null(writebackService.CurrentCustomerId);
    Assert.Equal("personal-info", writebackService.Step);
  }

  [Fact]
  public async Task PutBffApplicationStep_WithOktaWriteback_UpdatesAuthSessionCustomerId()
  {
    const string expectedCustomerId = "sample-customer-123456789abc";
    const string userId = "application-user-005";
    var writebackService = new CapturingCustomerIdWritebackService(
      expectedCustomerId);
    using var factory = _factory.WithWebHostBuilder(builder =>
      builder.ConfigureServices(services =>
      {
        services.RemoveAll<IOktaCustomerIdWritebackService>();
        services.AddSingleton<IOktaCustomerIdWritebackService>(writebackService);
      }));
    using var client = factory.CreateClient();
    var expiresAt = (int)DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
    using var syncResponse = await client.PostAsJsonAsync(
      "/bff/auth/session",
      new SyncWebAuthSessionRequest(
        "id-token-application-user-005",
        Session: new WebAuthSession(
          "okta",
          "authenticated",
          true,
          "aal1",
          new WebAuthSessionUser(
            userId,
            "Application User",
            "application-user-005@example.com")),
        ExpiresAt: expiresAt,
        ServerTokens: new WebAuthSessionTokenSet(
          "id-token-application-user-005")));

    Assert.Equal(HttpStatusCode.OK, syncResponse.StatusCode);

    var sessionId = Assert.Single(
      syncResponse.Headers.GetValues("x-acme-auth-session-id"));
    var sessionCookie = CreateSignedSessionCookie(sessionId);
    var csrfToken =
      await client.GetFromJsonAsync<IssueCsrfTokenResponse>("/bff/security/csrf");
    using var saveRequest = new HttpRequestMessage(
      HttpMethod.Put,
      "/bff/application/steps/personal-info");

    saveRequest.Headers.Add("x-csrf-token", csrfToken!.CsrfToken);
    saveRequest.Headers.Add("x-acme-auth-provider", "okta");
    saveRequest.Headers.Add("x-acme-authenticated-user-id", userId);
    saveRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={sessionCookie}");
    saveRequest.Content = JsonContent.Create(
      new SaveApplicationStepRequest(
        new Dictionary<string, JsonElement>
        {
          ["firstName"] = JsonSerializer.SerializeToElement("Ada"),
        }));

    using var saveResponse = await client.SendAsync(saveRequest);

    Assert.Equal(HttpStatusCode.OK, saveResponse.StatusCode);

    using var readSessionRequest = new HttpRequestMessage(
      HttpMethod.Get,
      "/bff/auth/session");

    readSessionRequest.Headers.Add(
      "Cookie",
      $"acme-los.auth-session={sessionCookie}");

    using var readSessionResponse = await client.SendAsync(readSessionRequest);
    var readSessionPayload =
      await readSessionResponse.Content.ReadFromJsonAsync<GetWebAuthSessionResponse>();

    Assert.Equal(HttpStatusCode.OK, readSessionResponse.StatusCode);
    Assert.Equal(
      expectedCustomerId,
      readSessionPayload!.Session.User?.CustomerId);
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
  public async Task GetBffAuthLogin_ReturnsAuthorizeUrl()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync(
      "/bff/auth/login?returnTo=/apply&aal=aal2&leadId=lead-123&widgetFlow=resetPassword");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<StartAuthFlowResponse>();

    Assert.NotNull(payload);
    Assert.Equal("/apply/personal-info", payload!.ReturnTo);
    Assert.False(string.IsNullOrWhiteSpace(payload.TransactionId));
    Assert.Equal(30 * 60, payload.MaxAge);

    var authorizeUrl = new Uri(payload.AuthorizeUrl);
    var query = QueryHelpers.ParseQuery(authorizeUrl.Query);

    Assert.Equal("dev-123456.okta.com", authorizeUrl.Host);
    Assert.Equal("/oauth2/default/v1/authorize", authorizeUrl.AbsolutePath);
    Assert.Equal("client-123", query["client_id"].ToString());
    Assert.Equal(
      "https://los.example.test/auth/callback",
      query["redirect_uri"].ToString());
    Assert.Equal("code", query["response_type"].ToString());
    Assert.Equal("S256", query["code_challenge_method"].ToString());
    Assert.Equal("urn:okta:loa:2fa:any", query["acr_values"].ToString());
    Assert.Equal("resetPassword", query["acme_widget_flow"].ToString());
    var requestedScopes = query["scope"].ToString().Split(' ');

    Assert.Contains("okta.myAccount.email.manage", requestedScopes);
    Assert.Contains("okta.myAccount.phone.manage", requestedScopes);
    Assert.Contains("okta.myAccount.password.manage", requestedScopes);
    Assert.False(query.ContainsKey("prompt"));
    Assert.False(query.ContainsKey("max_age"));
  }

  [Fact]
  public async Task GetBffAuthLogin_WithFundingStepUp_DoesNotForcePasswordReentry()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync(
      "/bff/auth/login?returnTo=/apply/funding&aal=aal2&stepUpReason=funding&stepUpMaxAgeSeconds=600&stepUpConsumeOnSatisfied=true");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<StartAuthFlowResponse>();

    Assert.NotNull(payload);
    Assert.Equal(30 * 60, payload!.MaxAge);

    var authorizeUrl = new Uri(payload.AuthorizeUrl);
    var query = QueryHelpers.ParseQuery(authorizeUrl.Query);

    Assert.Equal("urn:okta:loa:2fa:any", query["acr_values"].ToString());
    Assert.False(query.ContainsKey("max_age"));
    Assert.False(query.ContainsKey("prompt"));
  }

  [Fact]
  public async Task GetBffAuthLogin_WithFundingStepUpRequiresPassword_ForcesFreshOktaAuthentication()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
        ["ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD"] = "true",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync(
      "/bff/auth/login?returnTo=/apply/funding&aal=aal2&stepUpReason=funding&stepUpMaxAgeSeconds=600&stepUpConsumeOnSatisfied=true");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<StartAuthFlowResponse>();

    Assert.NotNull(payload);

    var authorizeUrl = new Uri(payload!.AuthorizeUrl);
    var query = QueryHelpers.ParseQuery(authorizeUrl.Query);

    Assert.Equal("urn:okta:loa:2fa:any", query["acr_values"].ToString());
    Assert.Equal("0", query["max_age"].ToString());
    Assert.False(query.ContainsKey("prompt"));
  }

  [Fact]
  public async Task GetBffAuthLogin_WithAccountPasswordStepUp_ForcesFreshOktaAuthentication()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync(
      "/bff/auth/login?returnTo=/account/security/password&aal=aal2&stepUpReason=account-password&stepUpMaxAgeSeconds=600");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var payload =
      await response.Content.ReadFromJsonAsync<StartAuthFlowResponse>();

    Assert.NotNull(payload);

    var authorizeUrl = new Uri(payload!.AuthorizeUrl);
    var query = QueryHelpers.ParseQuery(authorizeUrl.Query);

    Assert.Equal("urn:okta:loa:2fa:any", query["acr_values"].ToString());
    Assert.Equal("0", query["max_age"].ToString());
    Assert.False(query.ContainsKey("prompt"));
  }

  [Fact]
  public async Task OktaMyAccountService_ChangePassword_UsesScopedMyAccountPasswordApi()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var handler = new CapturingHttpMessageHandler(
      _ => new HttpResponseMessage(HttpStatusCode.NoContent));
    using var httpClient = new HttpClient(handler);
    var service = new OktaMyAccountService(
      new StaticHttpClientFactory(httpClient));

    var result = await service.ChangePasswordAsync(
      "access-token-123",
      new ChangePasswordRequest(
        "current-password-123",
        "new-password-456"),
      CancellationToken.None);

    Assert.Equal("changed", result.Status);

    var request = Assert.Single(handler.Requests);

    Assert.Equal(HttpMethod.Put, request.Method);
    Assert.Equal(
      "https://dev-123456.okta.com/idp/myaccount/password",
      request.RequestUri?.ToString());
    Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
    Assert.Equal("access-token-123", request.Headers.Authorization?.Parameter);
    Assert.Contains(
      request.Headers.Accept,
      value => string.Equals(value.MediaType, "application/json", StringComparison.Ordinal)
        && value.Parameters.Any(parameter =>
          string.Equals(parameter.Name, "okta-version", StringComparison.OrdinalIgnoreCase)
          && string.Equals(parameter.Value, "1.0.0", StringComparison.Ordinal)));

    var body = await request.Content!.ReadAsStringAsync();
    using var json = JsonDocument.Parse(body);
    var profile = json.RootElement.GetProperty("profile");

    Assert.Equal(
      "current-password-123",
      profile.GetProperty("currentPassword").GetString());
    Assert.Equal(
      "new-password-456",
      profile.GetProperty("password").GetString());
  }

  [Fact]
  public async Task OktaMyAccountService_EmailConflict_ReturnsClientSafeMessage()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var handler = new CapturingHttpMessageHandler(
      _ => new HttpResponseMessage(HttpStatusCode.Conflict)
      {
        Content = JsonContent.Create(new
        {
          errorCode = "E0000157",
          errorSummary = "Email already exists",
        }),
      });
    using var httpClient = new HttpClient(handler);
    var service = new OktaMyAccountService(
      new StaticHttpClientFactory(httpClient));

    var exception = await Assert.ThrowsAsync<OktaMyAccountException>(() =>
      service.StartEmailChangeAsync(
        "access-token-123",
        new StartEmailChangeRequest("existing@example.com"),
        CancellationToken.None).AsTask());

    Assert.Equal((int)HttpStatusCode.Conflict, exception.StatusCode);
    Assert.True(exception.ExposeMessageToClient);
    Assert.Contains("already associated", exception.Message);
  }

  [Fact]
  public void AuthAssurance_WithConfiguredFundingAcr_ReturnsAal2()
  {
    Assert.Equal(
      "aal2",
      AuthAssurance.GetAssuranceLevel(
        new[] { "pwd" },
        "urn:okta:loa:2fa:any",
        new[] { "urn:okta:loa:2fa:any" }));

    Assert.Equal(
      "aal1",
      AuthAssurance.GetAssuranceLevel(
        new[] { "pwd" },
        "urn:okta:loa:1fa:any",
        new[] { "urn:okta:loa:2fa:any" }));
  }

  [Fact]
  public void AuthAssurance_WithEmailOrSmsFundingMethod_AcceptsEitherEvidence()
  {
    Assert.True(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "email_or_sms",
        new[] { "pwd", "sms" }));

    Assert.True(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "email_or_sms",
        new[] { "pwd", "phone" }));

    Assert.True(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "email_or_sms",
        new[] { "pwd", "email" }));

    Assert.True(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "email",
        new[] { "pwd", "email" }));

    Assert.False(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "sms",
        new[] { "pwd", "email" }));

    Assert.False(
      AuthAssurance.IsFundingStepUpMethodSatisfied(
        "email_or_sms",
        new[] { "pwd", "totp" }));
  }

  [Fact]
  public async Task GetBffAuthCallback_WithoutTransaction_ReturnsBadRequest()
  {
    using var environment = new TemporaryEnvironmentVariables(
      new Dictionary<string, string?>
      {
        ["ACME_AUTH_PROVIDER"] = "okta",
        ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
        ["ACME_OKTA_CLIENT_ID"] = "client-123",
        ["ACME_OKTA_REDIRECT_URI"] = "https://los.example.test/auth/callback",
        ["ACME_OKTA_POST_LOGOUT_REDIRECT_URI"] = "https://los.example.test/",
      });
    using var client = _factory.CreateClient();
    using var response = await client.GetAsync(
      "/bff/auth/callback?code=code-123&state=state-123");

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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

  [Fact]
  public void OktaCustomerIdWritebackOptions_WhenEnabled_RequiresManageScope()
  {
    var exception = Assert.Throws<InvalidOperationException>(() =>
      OktaCustomerIdWritebackOptions.FromConfiguration(
        new ConfigurationBuilder()
          .AddInMemoryCollection(
            new Dictionary<string, string?>
            {
              ["ACME_OKTA_CUSTOMER_ID_WRITEBACK_MODE"] = "sample",
              ["ACME_OKTA_ISSUER"] = "https://dev-123456.okta.com/oauth2/default",
              ["ACME_OKTA_MANAGEMENT_CLIENT_ID"] = "service-client-id",
              ["ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM"] = CreatePrivateKeyPem(),
              ["ACME_OKTA_MANAGEMENT_SCOPES"] = "okta.users.read",
            })
          .Build()));

    Assert.Contains("okta.users.manage", exception.Message);
  }

  [Fact]
  public async Task OktaManagementTokenClient_RequestsScopedServiceTokenWithPrivateKeyJwt()
  {
    using var handler = new CapturingHttpMessageHandler(
      _ => new HttpResponseMessage(HttpStatusCode.OK)
      {
        Content = JsonContent.Create(new
        {
          access_token = "management-access-token",
          token_type = "Bearer",
          expires_in = 3600,
        }),
      });
    using var httpClient = new HttpClient(handler);
    var options = new OktaCustomerIdWritebackOptions(
      OktaCustomerIdWritebackMode.Sample,
      "https://dev-123456.okta.com/oauth2/default",
      "service-client-id",
      CreatePrivateKeyPem(),
      "key-1",
      ["okta.users.manage"]);
    var tokenClient = new OktaManagementTokenClient(
      new StaticHttpClientFactory(httpClient),
      options);

    var accessToken = await tokenClient.GetAccessTokenAsync(CancellationToken.None);

    Assert.Equal("management-access-token", accessToken);
    var request = Assert.Single(handler.Requests);
    Assert.Equal(HttpMethod.Post, request.Method);
    Assert.Equal("/oauth2/v1/token", request.RequestUri?.AbsolutePath);
    var body = await request.Content!.ReadAsStringAsync();
    var form = QueryHelpers.ParseQuery(body);

    Assert.Equal("client_credentials", form["grant_type"].ToString());
    Assert.Equal("okta.users.manage", form["scope"].ToString());
    Assert.Equal(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      form["client_assertion_type"].ToString());
    Assert.False(string.IsNullOrWhiteSpace(form["client_assertion"].ToString()));
  }

  [Fact]
  public async Task OktaCustomerIdWritebackService_PreservesExistingOktaCustomerId()
  {
    using var handler = new CapturingHttpMessageHandler(
      _ => new HttpResponseMessage(HttpStatusCode.OK)
      {
        Content = JsonContent.Create(new
        {
          profile = new
          {
            customerId = "customer-existing-okta",
          },
        }),
      });
    using var httpClient = new HttpClient(handler);
    var service = CreateOktaCustomerIdWritebackService(httpClient);

    var result = await service.EnsureCustomerIdAsync(
      "okta",
      "00u-application-user-001",
      currentCustomerId: null,
      "personal-info",
      CancellationToken.None);

    Assert.False(result.Written);
    Assert.Equal("customer-existing-okta", result.CustomerId);
    var request = Assert.Single(handler.Requests);
    Assert.Equal(HttpMethod.Get, request.Method);
    Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
    Assert.Equal("management-access-token", request.Headers.Authorization?.Parameter);
  }

  [Fact]
  public async Task OktaCustomerIdWritebackService_WritesSampleCustomerIdWithBearerToken()
  {
    using var handler = new CapturingHttpMessageHandler(
      request => request.Method == HttpMethod.Get
        ? new HttpResponseMessage(HttpStatusCode.OK)
        {
          Content = JsonContent.Create(new
          {
            profile = new { },
          }),
        }
        : new HttpResponseMessage(HttpStatusCode.OK)
        {
          Content = JsonContent.Create(new
          {
            profile = new { },
          }),
        });
    using var httpClient = new HttpClient(handler);
    var service = CreateOktaCustomerIdWritebackService(httpClient);
    var expectedCustomerId =
      OktaCustomerIdWritebackService.BuildSampleCustomerId(
        "00u-application-user-001");

    var result = await service.EnsureCustomerIdAsync(
      "okta",
      "00u-application-user-001",
      currentCustomerId: null,
      "personal-info",
      CancellationToken.None);

    Assert.True(result.Written);
    Assert.Equal(expectedCustomerId, result.CustomerId);
    Assert.Equal(2, handler.Requests.Count);
    Assert.Equal(HttpMethod.Get, handler.Requests[0].Method);
    Assert.Equal(HttpMethod.Post, handler.Requests[1].Method);
    Assert.Equal("Bearer", handler.Requests[1].Headers.Authorization?.Scheme);

    var body = await handler.Requests[1].Content!.ReadAsStringAsync();
    using var json = JsonDocument.Parse(body);

    Assert.Equal(
      expectedCustomerId,
      json.RootElement.GetProperty("profile").GetProperty("customerId").GetString());
  }

  [Fact]
  public void OktaIssuerPolicy_AcceptsKnownOktaIssuerBehindCustomDomain()
  {
    Assert.True(OktaIssuerPolicy.IsAllowedIssuer(
      "https://auth.avanai.net/oauth2/default",
      "https://dev-123456.okta.com/oauth2/default"));
  }

  [Fact]
  public void OktaIssuerPolicy_RejectsDifferentIssuerPath()
  {
    Assert.False(OktaIssuerPolicy.IsAllowedIssuer(
      "https://auth.avanai.net/oauth2/default",
      "https://dev-123456.okta.com/oauth2/other"));
  }

  [Fact]
  public void OktaIssuerPolicy_RejectsNonOktaHostMismatch()
  {
    Assert.False(OktaIssuerPolicy.IsAllowedIssuer(
      "https://auth.avanai.net/oauth2/default",
      "https://evil.example.test/oauth2/default"));
  }

  [Fact]
  public async Task OktaSigningKeyProvider_ReusesCachedKeysForKnownKid()
  {
    using var handler = new SequencedJwksHandler(CreateJwks("key-1"));
    using var httpClient = new HttpClient(handler);
    var provider = new OktaSigningKeyProvider(
      new StaticHttpClientFactory(httpClient));

    var firstKeys = await provider.GetSigningKeysAsync(
      "https://dev-123456.okta.com/oauth2/default",
      "key-1",
      CancellationToken.None);
    var secondKeys = await provider.GetSigningKeysAsync(
      "https://dev-123456.okta.com/oauth2/default",
      "key-1",
      CancellationToken.None);

    Assert.Contains(firstKeys, key => key.KeyId == "key-1");
    Assert.Contains(secondKeys, key => key.KeyId == "key-1");
    Assert.Equal(1, handler.RequestCount);
    Assert.Equal("/oauth2/default/v1/keys", Assert.Single(handler.RequestUris).AbsolutePath);
  }

  [Fact]
  public async Task OktaSigningKeyProvider_RefreshesCacheWhenKidIsUnknown()
  {
    using var handler = new SequencedJwksHandler(
      CreateJwks("key-1"),
      CreateJwks("key-2"));
    using var httpClient = new HttpClient(handler);
    var provider = new OktaSigningKeyProvider(
      new StaticHttpClientFactory(httpClient));

    var firstKeys = await provider.GetSigningKeysAsync(
      "https://dev-123456.okta.com/oauth2/default",
      "key-1",
      CancellationToken.None);
    var refreshedKeys = await provider.GetSigningKeysAsync(
      "https://dev-123456.okta.com/oauth2/default",
      "key-2",
      CancellationToken.None);

    Assert.Contains(firstKeys, key => key.KeyId == "key-1");
    Assert.Contains(refreshedKeys, key => key.KeyId == "key-2");
    Assert.Equal(2, handler.RequestCount);
  }

  private static string CreatePrivateKeyPem()
  {
    using var rsa = RSA.Create(2048);

    return PemEncoding.WriteString("PRIVATE KEY", rsa.ExportPkcs8PrivateKey());
  }

  private static OktaCustomerIdWritebackService CreateOktaCustomerIdWritebackService(
    HttpClient httpClient)
  {
    return new OktaCustomerIdWritebackService(
      new StaticHttpClientFactory(httpClient),
      NullLogger<OktaCustomerIdWritebackService>.Instance,
      new StaticOktaManagementTokenClient("management-access-token"),
      new OktaCustomerIdWritebackOptions(
        OktaCustomerIdWritebackMode.Sample,
        "https://dev-123456.okta.com/oauth2/default",
        "service-client-id",
        CreatePrivateKeyPem(),
        "key-1",
        ["okta.users.manage"]));
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
      Encoding.UTF8.GetBytes("acme-los-local-dev-session-secret"));
    var signaturePart = ToBase64Url(
      hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadPart)));

    return $"{payloadPart}.{signaturePart}";
  }

  private static string CreateUnsignedJwt(object payload)
  {
    return string.Join(
      '.',
      ToBase64Url(Encoding.UTF8.GetBytes("""{"alg":"none"}""")),
      ToBase64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload))),
      "signature");
  }

  private static string CreateJwks(string keyId)
  {
    using var rsa = RSA.Create(2048);
    var parameters = rsa.ExportParameters(false);

    return JsonSerializer.Serialize(
      new
      {
        keys = new[]
        {
          new
          {
            kty = "RSA",
            use = "sig",
            kid = keyId,
            alg = "RS256",
            n = ToBase64Url(parameters.Modulus!),
            e = ToBase64Url(parameters.Exponent!),
          },
        },
      });
  }

  private static string ToBase64Url(byte[] value)
  {
    return Convert.ToBase64String(value)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }

  private sealed class TemporaryEnvironmentVariables : IDisposable
  {
    private readonly Dictionary<string, string?> _originalValues;

    internal TemporaryEnvironmentVariables(
      IReadOnlyDictionary<string, string?> values)
    {
      _originalValues = values.Keys.ToDictionary(
        name => name,
        Environment.GetEnvironmentVariable);

      foreach (var (name, value) in values)
      {
        Environment.SetEnvironmentVariable(name, value);
      }
    }

    public void Dispose()
    {
      foreach (var (name, value) in _originalValues)
      {
        Environment.SetEnvironmentVariable(name, value);
      }
    }
  }

  private sealed class StaticHttpClientFactory : IHttpClientFactory
  {
    private readonly HttpClient _httpClient;

    internal StaticHttpClientFactory(HttpClient httpClient)
    {
      _httpClient = httpClient;
    }

    public HttpClient CreateClient(string name)
    {
      return _httpClient;
    }
  }

  private sealed class StaticOktaManagementTokenClient
    : IOktaManagementTokenClient
  {
    private readonly string _accessToken;

    internal StaticOktaManagementTokenClient(string accessToken)
    {
      _accessToken = accessToken;
    }

    public Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
      return Task.FromResult(_accessToken);
    }
  }

  private sealed class CapturingCustomerIdWritebackService
    : IOktaCustomerIdWritebackService
  {
    private readonly string _customerId;

    internal CapturingCustomerIdWritebackService(string customerId)
    {
      _customerId = customerId;
    }

    internal string? Provider { get; private set; }
    internal string? UserId { get; private set; }
    internal string? CurrentCustomerId { get; private set; }
    internal string? Step { get; private set; }

    public Task<OktaCustomerIdWritebackResult> EnsureCustomerIdAsync(
      string? provider,
      string userId,
      string? currentCustomerId,
      string step,
      CancellationToken cancellationToken)
    {
      Provider = provider;
      UserId = userId;
      CurrentCustomerId = currentCustomerId;
      Step = step;

      return Task.FromResult(
        new OktaCustomerIdWritebackResult(
          _customerId,
          Written: true,
          Source: "test",
          SkippedReason: null));
    }
  }

  private sealed class CapturingHttpMessageHandler : HttpMessageHandler
  {
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responseFactory;

    internal CapturingHttpMessageHandler(
      Func<HttpRequestMessage, HttpResponseMessage> responseFactory)
    {
      _responseFactory = responseFactory;
    }

    internal List<HttpRequestMessage> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(
      HttpRequestMessage request,
      CancellationToken cancellationToken)
    {
      var capturedRequest = await CloneRequestAsync(request, cancellationToken);

      Requests.Add(capturedRequest);

      return _responseFactory(capturedRequest);
    }

    private static async Task<HttpRequestMessage> CloneRequestAsync(
      HttpRequestMessage request,
      CancellationToken cancellationToken)
    {
      var clone = new HttpRequestMessage(request.Method, request.RequestUri);

      foreach (var header in request.Headers)
      {
        clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
      }

      if (request.Content is not null)
      {
        var content = await request.Content.ReadAsStringAsync(cancellationToken);
        clone.Content = new StringContent(content, Encoding.UTF8);

        foreach (var header in request.Content.Headers)
        {
          clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }
      }

      return clone;
    }
  }

  private sealed class SequencedJwksHandler : HttpMessageHandler
  {
    private readonly Queue<string> _responses;
    private string? _lastResponse;

    internal SequencedJwksHandler(params string[] responses)
    {
      _responses = new Queue<string>(responses);
    }

    internal int RequestCount { get; private set; }

    internal List<Uri> RequestUris { get; } = [];

    protected override Task<HttpResponseMessage> SendAsync(
      HttpRequestMessage request,
      CancellationToken cancellationToken)
    {
      RequestCount++;
      RequestUris.Add(request.RequestUri ?? new Uri("https://invalid.test/"));

      var response = _responses.Count > 0
        ? _responses.Dequeue()
        : _lastResponse ?? """{"keys":[]}""";

      _lastResponse = response;

      return Task.FromResult(
        new HttpResponseMessage(HttpStatusCode.OK)
        {
          Content = new StringContent(response, Encoding.UTF8, "application/json"),
        });
    }
  }

  private sealed class AcceptingBffServiceTokenValidator : IBffServiceTokenValidator
  {
    public Task<BffServiceTokenValidationResult> ValidateAsync(
      string token,
      CancellationToken cancellationToken)
    {
      return Task.FromResult(
        string.Equals(
          token,
          "accepted-service-token",
          StringComparison.Ordinal)
          ? BffServiceTokenValidationResult.Valid("web-client-id", "web-object-id")
          : BffServiceTokenValidationResult.Invalid());
    }
  }
}

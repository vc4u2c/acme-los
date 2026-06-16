using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;
using Acme.Los.Bff.Api.Infrastructure.State;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Los.Bff.Api.Infrastructure.Auth;

public interface IAuthFlowService
{
  ValueTask<StartAuthFlowResponse> StartLoginAsync(
    HttpRequest request,
    StartAuthFlowParameters parameters,
    CancellationToken cancellationToken);

  ValueTask<AuthSessionMutationResult> CompleteCallbackAsync(
    HttpContext context,
    string code,
    string state,
    CancellationToken cancellationToken);

  ValueTask<StartLogoutResponse> StartLogoutAsync(
    HttpContext context,
    CancellationToken cancellationToken);
}

public sealed record StartAuthFlowParameters(
  string? ReturnTo,
  string? MinimumAssuranceLevel,
  string? ExpectedUserId,
  string? LeadId,
  WebAuthStepUpRequirement? StepUp,
  string? WidgetFlow);

public sealed class BffAuthFlowService : IAuthFlowService
{
  private const int AuthTransactionMaxAgeSeconds = 30 * 60;

  private readonly IAuthTransactionStore _transactionStore;
  private readonly IAuthSessionService _authSessionService;
  private readonly IHttpClientFactory _httpClientFactory;
  private readonly IOktaSigningKeyProvider _oktaSigningKeyProvider;
  private readonly IHostEnvironment _environment;

  public BffAuthFlowService(
    IAuthTransactionStore transactionStore,
    IAuthSessionService authSessionService,
    IHttpClientFactory httpClientFactory,
    IOktaSigningKeyProvider oktaSigningKeyProvider,
    IHostEnvironment environment)
  {
    _transactionStore = transactionStore;
    _authSessionService = authSessionService;
    _httpClientFactory = httpClientFactory;
    _oktaSigningKeyProvider = oktaSigningKeyProvider;
    _environment = environment;
  }

  public async ValueTask<StartAuthFlowResponse> StartLoginAsync(
    HttpRequest request,
    StartAuthFlowParameters parameters,
    CancellationToken cancellationToken)
  {
    var options = OktaAuthOptions.FromEnvironment();
    var minimumAssuranceLevel =
      string.Equals(parameters.MinimumAssuranceLevel, "aal2", StringComparison.Ordinal)
        ? "aal2"
        : "aal1";
    var transactionId = CreateRandomToken();
    var state = CreateRandomToken();
    var nonce = CreateRandomToken();
    var codeVerifier = CreateRandomToken();
    var safeReturnTo = GetSafeReturnTo(parameters.ReturnTo);
    var currentEpochSeconds = GetCurrentEpochSeconds();
    var transaction = new StoredAuthTransaction(
      transactionId,
      state,
      nonce,
      codeVerifier,
      safeReturnTo,
      minimumAssuranceLevel,
      minimumAssuranceLevel == "aal2" && !string.IsNullOrWhiteSpace(parameters.ExpectedUserId)
        ? parameters.ExpectedUserId.Trim()
        : null,
      string.IsNullOrWhiteSpace(parameters.LeadId)
        ? null
        : parameters.LeadId.Trim(),
      minimumAssuranceLevel == "aal2" ? parameters.StepUp : null,
      currentEpochSeconds + AuthTransactionMaxAgeSeconds);

    await _transactionStore.WriteAsync(
      transaction,
      TimeSpan.FromSeconds(AuthTransactionMaxAgeSeconds),
      cancellationToken);

    var authorizeQuery = new Dictionary<string, string>
    {
      ["client_id"] = options.ClientId,
      ["redirect_uri"] = options.RedirectUri,
      ["response_type"] = "code",
      ["response_mode"] = "query",
      ["scope"] = string.Join(" ", options.Scopes),
      ["state"] = state,
      ["nonce"] = nonce,
      ["code_challenge"] = ToBase64Url(
        SHA256.HashData(Encoding.UTF8.GetBytes(codeVerifier))),
      ["code_challenge_method"] = "S256",
    };

    if (minimumAssuranceLevel == "aal2")
    {
      authorizeQuery["acr_values"] = options.FundingAcrValues;
    }

    if (minimumAssuranceLevel == "aal2"
      && ShouldForcePrimaryReauthentication(options, parameters.StepUp))
    {
      authorizeQuery["max_age"] = "0";
    }

    var widgetFlow = NormalizeHostedWidgetFlow(parameters.WidgetFlow);
    if (widgetFlow is not null)
    {
      authorizeQuery["acme_widget_flow"] = widgetFlow;
    }

    return new StartAuthFlowResponse(
      BuildUrlWithQuery(BuildIssuerEndpoint(options.Issuer, "authorize"), authorizeQuery),
      transactionId,
      AuthTransactionMaxAgeSeconds,
      safeReturnTo);
  }

  public async ValueTask<AuthSessionMutationResult> CompleteCallbackAsync(
    HttpContext context,
    string code,
    string state,
    CancellationToken cancellationToken)
  {
    var options = OktaAuthOptions.FromEnvironment();
    var transactionId = TryReadTransactionId(context.Request);

    if (string.IsNullOrWhiteSpace(transactionId))
    {
      throw new InvalidOperationException(
        "Your secure sign-in session expired. Please start the hosted sign-in flow again.");
    }

    var transaction = await _transactionStore.ReadAsync(
      transactionId,
      cancellationToken);

    if (transaction is null || transaction.ExpiresAt <= GetCurrentEpochSeconds())
    {
      throw new InvalidOperationException(
        "Your secure sign-in session expired. Please start the hosted sign-in flow again.");
    }

    if (!string.Equals(state, transaction.State, StringComparison.Ordinal))
    {
      await _transactionStore.DeleteAsync(transaction.TransactionId, cancellationToken);
      throw new InvalidOperationException(
        "The Okta callback state did not match this sign-in attempt.");
    }

    var tokenResponse = await ExchangeAuthorizationCodeAsync(
      options,
      code,
      transaction.CodeVerifier,
      cancellationToken);
    var idToken = string.IsNullOrWhiteSpace(tokenResponse.IdToken)
      ? throw new InvalidOperationException(
        "Okta did not return an id token for this callback.")
      : tokenResponse.IdToken;
    var claims = await ValidateIdTokenAsync(
      options,
      idToken,
      transaction.Nonce,
      cancellationToken);
    var session = BuildAuthenticatedSession(
      claims,
      transaction.LeadId,
      transaction.MinimumAssuranceLevel == "aal2"
        ? new[] { options.FundingAcrValues }
        : null);

    EnforceSessionRequirement(session, transaction, options);

    var expiresAt = TryReadIntClaim(claims, "exp")
      ?? GetCurrentEpochSeconds() + (tokenResponse.ExpiresIn ?? 60 * 60);
    var syncedSession = await _authSessionService.SyncSessionAsync(
      context,
      new SyncWebAuthSessionRequest(
        idToken,
        transaction.LeadId,
        Session: session,
        ExpiresAt: expiresAt,
        ServerTokens: new WebAuthSessionTokenSet(
          idToken,
          tokenResponse.AccessToken,
          tokenResponse.RefreshToken,
          tokenResponse.TokenType,
          tokenResponse.Scope,
          tokenResponse.ExpiresIn),
        StepUp: transaction.StepUp),
      cancellationToken);

    await _transactionStore.DeleteAsync(transaction.TransactionId, cancellationToken);

    return syncedSession with
    {
      Response = new CompleteAuthFlowResponse(
        session,
        transaction.ReturnTo,
        ((SyncWebAuthSessionResponse)syncedSession.Response).SessionTiming),
    };
  }

  public async ValueTask<StartLogoutResponse> StartLogoutAsync(
    HttpContext context,
    CancellationToken cancellationToken)
  {
    var options = OktaAuthOptions.TryFromEnvironment();
    var logoutHint =
      await _authSessionService.ReadLogoutHintAsync(
        context.Request,
        cancellationToken);
    var response =
      await _authSessionService.ClearSessionAsync(context, cancellationToken);
    var logoutUrl = options is not null && !string.IsNullOrWhiteSpace(logoutHint.IdToken)
      ? BuildOktaLogoutUrl(options, logoutHint.IdToken)
      : options?.PostLogoutRedirectUri ?? "/";

    return new StartLogoutResponse(
      response.Session,
      response.Cleared,
      logoutUrl,
      options is not null && !string.IsNullOrWhiteSpace(logoutHint.IdToken));
  }

  private string? TryReadTransactionId(HttpRequest request)
  {
    var payload = SignedCookie.TryRead<AuthTransactionCookiePayload>(
      request.Cookies.TryGetValue(CookieNames.AuthTransaction, out var rawCookieValue)
        ? rawCookieValue
        : null,
      _environment);

    return string.IsNullOrWhiteSpace(payload?.TransactionId)
      ? null
      : payload.TransactionId;
  }

  private async ValueTask<OktaTokenResponse> ExchangeAuthorizationCodeAsync(
    OktaAuthOptions options,
    string code,
    string codeVerifier,
    CancellationToken cancellationToken)
  {
    using var requestBody = new FormUrlEncodedContent(
      new Dictionary<string, string>
      {
        ["grant_type"] = "authorization_code",
        ["client_id"] = options.ClientId,
        ["redirect_uri"] = options.RedirectUri,
        ["code"] = code,
        ["code_verifier"] = codeVerifier,
      });
    using var response = await _httpClientFactory.CreateClient().PostAsync(
      BuildIssuerEndpoint(options.Issuer, "token"),
      requestBody,
      cancellationToken);
    var body =
      await response.Content.ReadFromJsonAsync<OktaTokenResponse>(
        cancellationToken: cancellationToken)
      ?? new OktaTokenResponse();

    if (!response.IsSuccessStatusCode)
    {
      throw new InvalidOperationException(
        body.ErrorDescription
        ?? body.Error
        ?? $"Okta token exchange failed ({(int)response.StatusCode}).");
    }

    return body;
  }

  private async ValueTask<Dictionary<string, string[]>> ValidateIdTokenAsync(
    OktaAuthOptions options,
    string idToken,
    string expectedNonce,
    CancellationToken cancellationToken)
  {
    var unvalidatedToken = TryReadIdToken(idToken);
    var tokenIssuer = unvalidatedToken?.Issuer;

    if (string.IsNullOrWhiteSpace(tokenIssuer)
      || !OktaIssuerPolicy.IsAllowedIssuer(options.Issuer, tokenIssuer))
    {
      throw new InvalidOperationException(
        "The Okta id token issuer does not match this app.");
    }

    var signingKeys = await _oktaSigningKeyProvider.GetSigningKeysAsync(
      tokenIssuer,
      unvalidatedToken?.Kid,
      cancellationToken);
    var handler = new JsonWebTokenHandler();
    var result = await handler.ValidateTokenAsync(
      idToken,
      new TokenValidationParameters
      {
        ClockSkew = TimeSpan.FromMinutes(5),
        RequireExpirationTime = true,
        RequireSignedTokens = true,
        ValidateAudience = true,
        ValidateIssuer = true,
        ValidateIssuerSigningKey = true,
        ValidateLifetime = true,
        ValidAudience = options.ClientId,
        ValidIssuers =
        [
          OktaIssuerPolicy.NormalizeIssuer(options.Issuer),
          OktaIssuerPolicy.NormalizeIssuer(tokenIssuer),
        ],
        IssuerSigningKeys = signingKeys,
      });

    if (!result.IsValid || result.ClaimsIdentity is null)
    {
      throw new InvalidOperationException("Okta id token validation failed.");
    }

    var claims = result.ClaimsIdentity.Claims
      .GroupBy(claim => claim.Type)
      .ToDictionary(
        group => group.Key,
        group => group.Select(claim => claim.Value).ToArray());
    var nonce = TryReadStringClaim(claims, "nonce");

    if (!string.Equals(nonce, expectedNonce, StringComparison.Ordinal))
    {
      throw new InvalidOperationException(
        "The Okta callback nonce did not match this sign-in attempt.");
    }

    return claims;
  }

  private static WebAuthSession BuildAuthenticatedSession(
    IReadOnlyDictionary<string, string[]> claims,
    string? fallbackLeadId,
    IEnumerable<string>? acceptedHighAssuranceAcrValues = null)
  {
    var authenticationMethods = TryReadStringClaims(claims, "amr");
    var acr = TryReadStringClaim(claims, "acr");
    var email = TryReadStringClaim(claims, ClaimTypes.Email)
      ?? TryReadStringClaim(claims, "email");
    var claimedName = TryReadStringClaim(claims, "name")?.Trim() ?? string.Empty;
    var nameParts = claimedName
      .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    var firstName =
      TryReadStringClaim(claims, "given_name")
      ?? (nameParts.Length > 0 ? nameParts[0] : null);
    var lastName =
      TryReadStringClaim(claims, "family_name")
      ?? (nameParts.Length > 1 ? string.Join(" ", nameParts.Skip(1)) : null);
    var leadId =
      TryReadStringClaim(claims, "lead_id")
      ?? TryReadStringClaim(claims, "leadId")
      ?? fallbackLeadId;
    var customerId =
      TryReadStringClaim(claims, "customer_id")
      ?? TryReadStringClaim(claims, "customerId");
    var derivedDisplayName =
      string.Join(" ", new[] { firstName, lastName }.Where(value => !string.IsNullOrWhiteSpace(value)));
    var displayName =
      !string.IsNullOrWhiteSpace(claimedName)
        ? claimedName
        : !string.IsNullOrWhiteSpace(derivedDisplayName)
          ? derivedDisplayName
          : email ?? "Customer";
    var id =
      TryReadStringClaim(claims, "sub")
      ?? TryReadStringClaim(claims, ClaimTypes.NameIdentifier);

    if (string.IsNullOrWhiteSpace(id))
    {
      throw new InvalidOperationException(
        "The Okta ID token is missing the required subject claim.");
    }

    return new WebAuthSession(
      "okta",
      "authenticated",
      true,
      AuthAssurance.GetAssuranceLevel(
        authenticationMethods,
        acr,
        acceptedHighAssuranceAcrValues),
      new WebAuthSessionUser(
        id,
        string.IsNullOrWhiteSpace(displayName) ? "Customer" : displayName,
        email,
        firstName,
        lastName,
        leadId,
        customerId,
        authenticationMethods.Length == 0 ? null : authenticationMethods));
  }

  private static void EnforceSessionRequirement(
    WebAuthSession session,
    StoredAuthTransaction transaction,
    OktaAuthOptions options)
  {
    if (!string.IsNullOrWhiteSpace(transaction.ExpectedUserId)
      && !string.Equals(
        session.User?.Id,
        transaction.ExpectedUserId,
        StringComparison.Ordinal))
    {
      throw new InvalidOperationException(
        "Step-up sign-in must complete with the same user.");
    }

    if (ToAssuranceRank(session.AssuranceLevel)
      < ToAssuranceRank(transaction.MinimumAssuranceLevel))
    {
      throw new InvalidOperationException(
        "The completed sign-in did not satisfy the required assurance level.");
    }

    if (string.Equals(transaction.StepUp?.Reason, "funding", StringComparison.Ordinal)
      && !AuthAssurance.IsFundingStepUpMethodSatisfied(
        options.FundingStepUpMethod,
        session.User?.AuthenticationMethods))
    {
      throw new InvalidOperationException(
        "Funding step-up must be completed with email or phone OTP.");
    }

    if (string.Equals(transaction.StepUp?.Reason, "account-email", StringComparison.Ordinal)
      && !AuthAssurance.IsSmsAuthenticationMethodSatisfied(
        session.User?.AuthenticationMethods))
    {
      throw new InvalidOperationException(
        "Email change step-up must be completed with phone/SMS OTP.");
    }

    if (string.Equals(transaction.StepUp?.Reason, "account-phone", StringComparison.Ordinal)
      && !AuthAssurance.IsEmailAuthenticationMethodSatisfied(
        session.User?.AuthenticationMethods))
    {
      throw new InvalidOperationException(
        "Phone change step-up must be completed with email OTP.");
    }
  }

  private static string BuildOktaLogoutUrl(
    OktaAuthOptions options,
    string idToken)
  {
    var issuer = options.Issuer;
    var tokenIssuer = TryReadIssuerFromIdToken(idToken);

    if (new Uri(options.Issuer).Host.EndsWith(".okta.com", StringComparison.OrdinalIgnoreCase)
      && !string.IsNullOrWhiteSpace(tokenIssuer))
    {
      issuer = tokenIssuer;
    }

    return BuildUrlWithQuery(
      BuildIssuerEndpoint(issuer, "logout"),
      new Dictionary<string, string>
      {
        ["id_token_hint"] = idToken,
        ["post_logout_redirect_uri"] = options.PostLogoutRedirectUri,
      });
  }

  private static string? TryReadIssuerFromIdToken(string idToken)
  {
    return TryReadIdToken(idToken)?.Issuer;
  }

  private static JsonWebToken? TryReadIdToken(string idToken)
  {
    try
    {
      return new JsonWebTokenHandler().ReadJsonWebToken(idToken);
    }
    catch (ArgumentException)
    {
      return null;
    }
    catch (SecurityTokenException)
    {
      return null;
    }
  }

  private static Uri BuildIssuerEndpoint(string issuer, string endpoint)
  {
    var issuerUri = new Uri(issuer);
    var issuerPath = issuerUri.AbsolutePath.TrimEnd('/');

    return new Uri(
      $"{issuerUri.Scheme}://{issuerUri.Authority}{issuerPath}/v1/{endpoint}");
  }

  private static string BuildUrlWithQuery(
    Uri uri,
    IReadOnlyDictionary<string, string> query)
  {
    var builder = new UriBuilder(uri)
    {
      Query = string.Join(
        '&',
        query.Select(parameter =>
          $"{Uri.EscapeDataString(parameter.Key)}={Uri.EscapeDataString(parameter.Value)}")),
    };

    return builder.Uri.ToString();
  }

  private static string? NormalizeHostedWidgetFlow(string? widgetFlow)
  {
    return widgetFlow switch
    {
      "resetPassword" => "resetPassword",
      "unlockAccount" => "unlockAccount",
      "signup" => "signup",
      _ => null,
    };
  }

  private static bool ShouldForcePrimaryReauthentication(
    OktaAuthOptions options,
    WebAuthStepUpRequirement? stepUp)
  {
    if (stepUp is null)
    {
      return false;
    }

    if (string.Equals(stepUp.Reason, "funding", StringComparison.Ordinal))
    {
      return options.FundingStepUpRequiresPassword;
    }

    return true;
  }

  private static string GetSafeReturnTo(string? returnTo)
  {
    if (string.IsNullOrWhiteSpace(returnTo)
      || !returnTo.StartsWith("/", StringComparison.Ordinal)
      || returnTo.StartsWith("//", StringComparison.Ordinal))
    {
      return "/apply/personal-info";
    }

    return returnTo switch
    {
      "/apply" => "/apply/personal-info",
      _ when returnTo.StartsWith("/apply?", StringComparison.Ordinal) =>
        $"/apply/personal-info{returnTo["/apply".Length..]}",
      _ => returnTo,
    };
  }

  private static int ToAssuranceRank(string? assuranceLevel)
  {
    return assuranceLevel switch
    {
      "aal2" => 2,
      "aal1" => 1,
      _ => 0,
    };
  }

  private static string[] TryReadStringClaims(
    IReadOnlyDictionary<string, string[]> claims,
    string name)
  {
    return claims.TryGetValue(name, out var values)
      ? values.Where(value => !string.IsNullOrWhiteSpace(value)).ToArray()
      : [];
  }

  private static string? TryReadStringClaim(
    IReadOnlyDictionary<string, string[]> claims,
    string name)
  {
    return TryReadStringClaims(claims, name).FirstOrDefault();
  }

  private static int? TryReadIntClaim(
    IReadOnlyDictionary<string, string[]> claims,
    string name)
  {
    var value = TryReadStringClaim(claims, name);

    return int.TryParse(value, out var parsedValue) ? parsedValue : null;
  }

  private static int GetCurrentEpochSeconds()
  {
    return (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  }

  private static string CreateRandomToken()
  {
    return ToBase64Url(RandomNumberGenerator.GetBytes(32));
  }

  private static string ToBase64Url(byte[] value)
  {
    return Convert.ToBase64String(value)
      .Replace('+', '-')
      .Replace('/', '_')
      .TrimEnd('=');
  }

  private sealed record AuthTransactionCookiePayload(string TransactionId);
}

internal sealed record OktaTokenResponse(
  [property: JsonPropertyName("access_token")]
  string? AccessToken = null,
  [property: JsonPropertyName("expires_in")]
  int? ExpiresIn = null,
  [property: JsonPropertyName("id_token")]
  string? IdToken = null,
  [property: JsonPropertyName("refresh_token")]
  string? RefreshToken = null,
  [property: JsonPropertyName("scope")]
  string? Scope = null,
  [property: JsonPropertyName("token_type")]
  string? TokenType = null,
  [property: JsonPropertyName("error")]
  string? Error = null,
  [property: JsonPropertyName("error_description")]
  string? ErrorDescription = null);

internal sealed record OktaAuthOptions(
  string Issuer,
  string ClientId,
  string RedirectUri,
  string PostLogoutRedirectUri,
  string[] Scopes,
  string FundingAcrValues,
  string FundingStepUpMethod,
  bool FundingStepUpRequiresPassword)
{
  internal static OktaAuthOptions FromEnvironment()
  {
    return TryFromEnvironment()
      ?? throw new InvalidOperationException(
        "Okta auth config is not available for the BFF auth flow.");
  }

  internal static OktaAuthOptions? TryFromEnvironment()
  {
    var provider = ReadConfigValue(
      "ACME_AUTH_PROVIDER",
      "NEXT_PUBLIC_AUTH_PROVIDER");

    if (!string.IsNullOrWhiteSpace(provider)
      && !string.Equals(provider, "okta", StringComparison.Ordinal))
    {
      return null;
    }

    var issuer = ReadConfigValue("ACME_OKTA_ISSUER", "NEXT_PUBLIC_OKTA_ISSUER");
    var clientId = ReadConfigValue("ACME_OKTA_CLIENT_ID", "NEXT_PUBLIC_OKTA_CLIENT_ID");
    var redirectUri = ReadConfigValue(
      "ACME_OKTA_REDIRECT_URI",
      "NEXT_PUBLIC_OKTA_REDIRECT_URI");
    var postLogoutRedirectUri = ReadConfigValue(
      "ACME_OKTA_POST_LOGOUT_REDIRECT_URI",
      "NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI");

    return string.IsNullOrWhiteSpace(issuer)
      || string.IsNullOrWhiteSpace(clientId)
      || string.IsNullOrWhiteSpace(redirectUri)
      || string.IsNullOrWhiteSpace(postLogoutRedirectUri)
        ? null
        : new OktaAuthOptions(
          issuer.TrimEnd('/'),
          clientId,
          redirectUri,
          postLogoutRedirectUri,
          [
            "openid",
            "profile",
            "email",
            "offline_access",
            "okta.myAccount.email.read",
            "okta.myAccount.email.manage",
            "okta.myAccount.phone.read",
            "okta.myAccount.phone.manage",
          ],
          ReadConfigValue(
            "ACME_OKTA_FUNDING_ACR_VALUES",
            "NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES")
          ?? "urn:okta:loa:2fa:any",
          ReadConfigValue(
            "ACME_OKTA_FUNDING_STEP_UP_METHOD",
            "NEXT_PUBLIC_OKTA_FUNDING_STEP_UP_METHOD")
          ?? "email_or_sms",
          ReadBooleanConfigValue(
            "ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD",
            "NEXT_PUBLIC_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD",
            false));
  }

  private static string? ReadConfigValue(
    string runtimeName,
    string legacyPublicName)
  {
    var runtimeValue = Environment.GetEnvironmentVariable(runtimeName)?.Trim();
    var legacyPublicValue =
      Environment.GetEnvironmentVariable(legacyPublicName)?.Trim();

    return !string.IsNullOrWhiteSpace(runtimeValue)
      ? runtimeValue
      : string.IsNullOrWhiteSpace(legacyPublicValue)
        ? null
        : legacyPublicValue;
  }

  private static bool ReadBooleanConfigValue(
    string runtimeName,
    string legacyPublicName,
    bool defaultValue)
  {
    var value = ReadConfigValue(runtimeName, legacyPublicName);

    return string.IsNullOrWhiteSpace(value)
      ? defaultValue
      : bool.TryParse(value, out var parsed)
        ? parsed
        : defaultValue;
  }
}

public interface IAuthTransactionStore
{
  ValueTask<StoredAuthTransaction?> ReadAsync(
    string transactionId,
    CancellationToken cancellationToken);

  ValueTask WriteAsync(
    StoredAuthTransaction transaction,
    TimeSpan timeToLive,
    CancellationToken cancellationToken);

  ValueTask DeleteAsync(
    string transactionId,
    CancellationToken cancellationToken);
}

public sealed record StoredAuthTransaction(
  string TransactionId,
  string State,
  string Nonce,
  string CodeVerifier,
  string ReturnTo,
  string MinimumAssuranceLevel,
  string? ExpectedUserId,
  string? LeadId,
  WebAuthStepUpRequirement? StepUp,
  int ExpiresAt);

internal sealed class InMemoryAuthTransactionStore : IAuthTransactionStore
{
  private readonly ConcurrentDictionary<string, StoredAuthTransaction> _transactions = new();

  public ValueTask<StoredAuthTransaction?> ReadAsync(
    string transactionId,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    if (!_transactions.TryGetValue(transactionId, out var transaction))
    {
      return ValueTask.FromResult<StoredAuthTransaction?>(null);
    }

    if (transaction.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
    {
      _transactions.TryRemove(transactionId, out _);
      return ValueTask.FromResult<StoredAuthTransaction?>(null);
    }

    return ValueTask.FromResult<StoredAuthTransaction?>(transaction);
  }

  public ValueTask WriteAsync(
    StoredAuthTransaction transaction,
    TimeSpan timeToLive,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    _transactions[transaction.TransactionId] = transaction;

    return ValueTask.CompletedTask;
  }

  public ValueTask DeleteAsync(
    string transactionId,
    CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    _transactions.TryRemove(transactionId, out _);

    return ValueTask.CompletedTask;
  }
}

internal sealed class RedisAuthTransactionStore : IAuthTransactionStore
{
  private const string Namespace = "auth-transaction";

  private readonly RedisStateStore _stateStore;

  public RedisAuthTransactionStore(RedisStateStore stateStore)
  {
    _stateStore = stateStore;
  }

  public ValueTask<StoredAuthTransaction?> ReadAsync(
    string transactionId,
    CancellationToken cancellationToken)
  {
    return _stateStore.ReadAsync<StoredAuthTransaction>(
      Namespace,
      transactionId,
      cancellationToken);
  }

  public ValueTask WriteAsync(
    StoredAuthTransaction transaction,
    TimeSpan timeToLive,
    CancellationToken cancellationToken)
  {
    return _stateStore.WriteAsync(
      Namespace,
      transaction.TransactionId,
      transaction,
      timeToLive,
      cancellationToken);
  }

  public ValueTask DeleteAsync(
    string transactionId,
    CancellationToken cancellationToken)
  {
    return _stateStore.DeleteAsync(Namespace, transactionId, cancellationToken);
  }
}

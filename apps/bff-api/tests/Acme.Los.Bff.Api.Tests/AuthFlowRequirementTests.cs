using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Auth;

namespace Acme.Los.Bff.Api.Tests;

public sealed class AuthFlowRequirementTests
{
  private static readonly OktaAuthOptions Options = new(
    "https://example.okta.com/oauth2/default",
    "client-id",
    "https://los.example.test/account/sign-in",
    "https://los.example.test/",
    ["openid"],
    "urn:okta:loa:2fa:any",
    "email_or_sms",
    false,
    "https://example.okta.com");

  [Theory]
  [InlineData("email")]
  [InlineData("okta_email")]
  [InlineData("sms")]
  [InlineData("phone_number:sms")]
  public void Funding_AllowsOneEmailOrSmsFactorWithoutPassword(string method)
  {
    var session = BuildSession([method]);
    var transaction = BuildTransaction("funding");

    BffAuthFlowService.EnforceSessionRequirement(session, transaction, Options);
  }

  [Fact]
  public void Funding_RejectsPasswordWithoutEmailOrSmsOtp()
  {
    var exception = Assert.Throws<InvalidOperationException>(() =>
      BffAuthFlowService.EnforceSessionRequirement(
        BuildSession(["pwd"]),
        BuildTransaction("funding"),
        Options));

    Assert.Contains("email or phone OTP", exception.Message);
  }

  [Theory]
  [InlineData("account-email")]
  [InlineData("account-password")]
  public void EmailAndPasswordChanges_RequirePasswordAndSms(string reason)
  {
    BffAuthFlowService.EnforceSessionRequirement(
      BuildSession(["pwd", "sms"]),
      BuildTransaction(reason),
      Options);

    var exception = Assert.Throws<InvalidOperationException>(() =>
      BffAuthFlowService.EnforceSessionRequirement(
        BuildSession(["pwd", "email"]),
        BuildTransaction(reason),
        Options));

    Assert.Contains("phone/SMS OTP", exception.Message);
  }

  [Fact]
  public void PhoneChange_RequiresPasswordAndEmailOtp()
  {
    BffAuthFlowService.EnforceSessionRequirement(
      BuildSession(["pwd", "email"]),
      BuildTransaction("account-phone"),
      Options);

    var exception = Assert.Throws<InvalidOperationException>(() =>
      BffAuthFlowService.EnforceSessionRequirement(
        BuildSession(["pwd", "sms"]),
        BuildTransaction("account-phone"),
        Options));

    Assert.Contains("email OTP", exception.Message);
  }

  [Theory]
  [InlineData("account-email", "sms")]
  [InlineData("account-phone", "email")]
  [InlineData("account-password", "sms")]
  public void AccountChanges_RejectOppositeFactorWithoutPassword(
    string reason,
    string factor)
  {
    var exception = Assert.Throws<InvalidOperationException>(() =>
      BffAuthFlowService.EnforceSessionRequirement(
        BuildSession([factor]),
        BuildTransaction(reason),
        Options));

    Assert.Contains("fresh password verification", exception.Message);
  }

  [Fact]
  public void StepUp_RejectsASecondUser()
  {
    var exception = Assert.Throws<InvalidOperationException>(() =>
      BffAuthFlowService.EnforceSessionRequirement(
        BuildSession(["pwd", "sms"], "different-user"),
        BuildTransaction("account-email"),
        Options));

    Assert.Contains("same user", exception.Message);
  }

  private static WebAuthSession BuildSession(
    string[] authenticationMethods,
    string userId = "user-123") =>
    new(
      "okta",
      "authenticated",
      true,
      "aal2",
      new WebAuthSessionUser(
        userId,
        "Test Customer",
        "customer@example.com",
        AuthenticationMethods: authenticationMethods));

  private static StoredAuthTransaction BuildTransaction(string reason) =>
    new(
      "transaction-123",
      "state-123",
      "nonce-123",
      "verifier-123",
      "/account/profile",
      "aal2",
      "user-123",
      null,
      new WebAuthStepUpRequirement(reason, 600),
      int.MaxValue);
}

using System.Collections.Concurrent;
using Acme.Los.Bff.Api.Contracts;

namespace Acme.Los.Bff.Api.Features.Customer;

public sealed record GetCustomerProfileQuery(string UserId, string? UserEmail);

public sealed record UpdateCustomerProfileCommand(
  string UserId,
  string? UserEmail,
  CustomerProfile Profile);

public interface ICustomerProfileStore
{
  ValueTask<CustomerProfile?> ReadAsync(
    string userId,
    CancellationToken cancellationToken);

  ValueTask WriteAsync(
    string userId,
    CustomerProfile profile,
    CancellationToken cancellationToken);
}

public sealed class InMemoryCustomerProfileStore : ICustomerProfileStore
{
  private readonly ConcurrentDictionary<string, CustomerProfile> _profiles =
    new(StringComparer.Ordinal);

  public ValueTask<CustomerProfile?> ReadAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    _profiles.TryGetValue(userId, out var profile);
    return ValueTask.FromResult(profile);
  }

  public ValueTask WriteAsync(
    string userId,
    CustomerProfile profile,
    CancellationToken cancellationToken)
  {
    _profiles[userId] = profile;
    return ValueTask.CompletedTask;
  }
}

public sealed class CustomerProfileHandler
{
  private static readonly CustomerProfile EmptyProfile =
    new("", "", "", "", "", "", "");

  private readonly ICustomerProfileStore _store;
  private readonly ILogger<CustomerProfileHandler> _logger;

  public CustomerProfileHandler(
    ICustomerProfileStore store,
    ILogger<CustomerProfileHandler> logger)
  {
    _store = store;
    _logger = logger;
  }

  public async Task<GetCustomerProfileResponse> Handle(
    GetCustomerProfileQuery query,
    CancellationToken cancellationToken)
  {
    var storedProfile = await _store.ReadAsync(query.UserId, cancellationToken);
    var authenticatedEmail = query.UserEmail?.Trim() ?? string.Empty;
    var storedEmail = storedProfile?.Email?.Trim() ?? string.Empty;
    var email = !string.IsNullOrWhiteSpace(authenticatedEmail)
      ? authenticatedEmail
      : storedEmail;
    var profile = storedProfile is null
      ? EmptyProfile with { Email = email }
      : storedProfile with { Email = email };
    var synchronizedFromOkta =
      !string.IsNullOrWhiteSpace(authenticatedEmail)
      && !string.Equals(
        storedEmail,
        authenticatedEmail,
        StringComparison.OrdinalIgnoreCase);

    if (storedProfile is not null && synchronizedFromOkta)
    {
      await _store.WriteAsync(query.UserId, profile, cancellationToken);

      if (!string.IsNullOrWhiteSpace(storedEmail))
      {
        _logger.LogInformation(
          "Synchronized customer profile email from the authenticated Okta session. Event={Event} UserId={UserId}",
          "customer.profile.email_changed",
          query.UserId);
      }
    }

    return new GetCustomerProfileResponse(profile);
  }

  public async Task<UpdateCustomerProfileResponse> Handle(
    UpdateCustomerProfileCommand command,
    CancellationToken cancellationToken)
  {
    var profile = command.Profile with
    {
      Email = !string.IsNullOrWhiteSpace(command.UserEmail)
        ? command.UserEmail
        : command.Profile.Email,
    };

    await _store.WriteAsync(command.UserId, profile, cancellationToken);

    return new UpdateCustomerProfileResponse(profile);
  }
}

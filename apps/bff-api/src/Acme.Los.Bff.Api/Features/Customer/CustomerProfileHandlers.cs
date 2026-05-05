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

  public CustomerProfileHandler(ICustomerProfileStore store)
  {
    _store = store;
  }

  public async Task<GetCustomerProfileResponse> Handle(
    GetCustomerProfileQuery query,
    CancellationToken cancellationToken)
  {
    var storedProfile = await _store.ReadAsync(query.UserId, cancellationToken);
    var email = !string.IsNullOrWhiteSpace(storedProfile?.Email)
      ? storedProfile.Email
      : query.UserEmail ?? string.Empty;
    var profile = storedProfile is null
      ? EmptyProfile with { Email = email }
      : storedProfile with { Email = email };

    return new GetCustomerProfileResponse(profile);
  }

  public async Task<UpdateCustomerProfileResponse> Handle(
    UpdateCustomerProfileCommand command,
    CancellationToken cancellationToken)
  {
    var profile = command.Profile with
    {
      Email = !string.IsNullOrWhiteSpace(command.Profile.Email)
        ? command.Profile.Email
        : command.UserEmail ?? string.Empty,
    };

    await _store.WriteAsync(command.UserId, profile, cancellationToken);

    return new UpdateCustomerProfileResponse(profile);
  }
}

using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Features.Customer;

namespace Acme.Los.Bff.Api.Infrastructure.State;

internal sealed class RedisCustomerProfileStore : ICustomerProfileStore
{
  private const string Namespace = "customer-profile";
  private static readonly TimeSpan TimeToLive = TimeSpan.FromDays(30);

  private readonly RedisStateStore _stateStore;

  public RedisCustomerProfileStore(RedisStateStore stateStore)
  {
    _stateStore = stateStore;
  }

  public async ValueTask<CustomerProfile?> ReadAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    var storedProfile = await _stateStore.ReadAsync<CustomerProfileDocument>(
      Namespace,
      userId,
      cancellationToken);

    return storedProfile?.Profile;
  }

  public ValueTask WriteAsync(
    string userId,
    CustomerProfile profile,
    CancellationToken cancellationToken)
  {
    return _stateStore.WriteAsync(
      Namespace,
      userId,
      new CustomerProfileDocument(profile),
      TimeToLive,
      cancellationToken);
  }

  private sealed record CustomerProfileDocument(CustomerProfile Profile);
}

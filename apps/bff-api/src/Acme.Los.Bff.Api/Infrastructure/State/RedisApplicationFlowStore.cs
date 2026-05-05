using System.Text.Json;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Features.Application;

namespace Acme.Los.Bff.Api.Infrastructure.State;

internal sealed class RedisApplicationFlowStore : IApplicationFlowStore
{
  private const string Namespace = "application-flow";
  private static readonly TimeSpan TimeToLive = TimeSpan.FromHours(8);

  private readonly RedisStateStore _stateStore;

  public RedisApplicationFlowStore(RedisStateStore stateStore)
  {
    _stateStore = stateStore;
  }

  public async ValueTask<ApplicationFlowState?> ReadAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    var storedState = await _stateStore.ReadAsync<ApplicationFlowStateDocument>(
      Namespace,
      userId,
      cancellationToken);

    if (storedState is null)
    {
      return null;
    }

    if (storedState.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
    {
      await _stateStore.DeleteAsync(Namespace, userId, cancellationToken);
      return null;
    }

    return new ApplicationFlowState(
      storedState.FlowId,
      storedState.UserId,
      ClonePayload(storedState.FormState),
      storedState.Summary);
  }

  public ValueTask WriteAsync(
    string userId,
    ApplicationFlowState state,
    CancellationToken cancellationToken)
  {
    var persistedState = new ApplicationFlowStateDocument(
      state.FlowId,
      state.UserId,
      ClonePayload(state.FormState),
      state.Summary,
      DateTimeOffset.UtcNow.Add(TimeToLive).ToUnixTimeSeconds(),
      null);

    return _stateStore.WriteAsync(
      Namespace,
      userId,
      persistedState,
      TimeToLive,
      cancellationToken);
  }

  public ValueTask DeleteAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    return _stateStore.DeleteAsync(Namespace, userId, cancellationToken);
  }

  private static Dictionary<string, JsonElement> ClonePayload(
    Dictionary<string, JsonElement>? payload)
  {
    var clone = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

    if (payload is null)
    {
      return clone;
    }

    foreach (var (key, value) in payload)
    {
      clone[key] = value.Clone();
    }

    return clone;
  }

  private sealed record ApplicationFlowStateDocument(
    string FlowId,
    string UserId,
    Dictionary<string, JsonElement> FormState,
    ApplicationFlowSummary Summary,
    long ExpiresAt,
    string? SubmittedAt);
}

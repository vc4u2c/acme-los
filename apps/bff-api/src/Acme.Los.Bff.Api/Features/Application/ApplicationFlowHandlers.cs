using System.Collections.Concurrent;
using System.Text.Json;
using Acme.Los.Bff.Api.Contracts;

namespace Acme.Los.Bff.Api.Features.Application;

public sealed record GetApplicationStepQuery(
  string UserId,
  string? CustomerId,
  string? LeadId,
  string Step);

public sealed record SaveApplicationStepCommand(
  string UserId,
  string? CustomerId,
  string? LeadId,
  string Step,
  Dictionary<string, JsonElement> Payload);

public sealed record SubmitApplicationCommand(
  string UserId,
  string? CustomerId,
  string? LeadId,
  string Step,
  Dictionary<string, JsonElement>? Payload = null);

public interface IApplicationFlowStore
{
  ValueTask<ApplicationFlowState?> ReadAsync(
    string userId,
    CancellationToken cancellationToken);

  ValueTask WriteAsync(
    string userId,
    ApplicationFlowState state,
    CancellationToken cancellationToken);

  ValueTask DeleteAsync(
    string userId,
    CancellationToken cancellationToken);
}

public sealed record ApplicationFlowState(
  string FlowId,
  string UserId,
  Dictionary<string, JsonElement> FormState,
  ApplicationFlowSummary Summary);

public sealed class InMemoryApplicationFlowStore : IApplicationFlowStore
{
  private readonly ConcurrentDictionary<string, ApplicationFlowState> _flows =
    new(StringComparer.Ordinal);

  public ValueTask<ApplicationFlowState?> ReadAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    _flows.TryGetValue(userId, out var state);
    return ValueTask.FromResult(state);
  }

  public ValueTask WriteAsync(
    string userId,
    ApplicationFlowState state,
    CancellationToken cancellationToken)
  {
    _flows[userId] = state;
    return ValueTask.CompletedTask;
  }

  public ValueTask DeleteAsync(
    string userId,
    CancellationToken cancellationToken)
  {
    _flows.TryRemove(userId, out _);
    return ValueTask.CompletedTask;
  }
}

public sealed class ApplicationFlowHandler
{
  private static readonly string[] OrderedSteps =
  [
    "personal-info",
    "disclosures",
    "employment-income",
    "bank-card",
    "pre-approval",
    "documents-signing",
    "funding",
  ];

  private static readonly HashSet<string> ValidSteps =
    new(OrderedSteps, StringComparer.Ordinal);

  private readonly IApplicationFlowStore _store;

  public ApplicationFlowHandler(IApplicationFlowStore store)
  {
    _store = store;
  }

  public static bool IsSupportedStep(string step)
  {
    return ValidSteps.Contains(step);
  }

  public async Task<GetApplicationStepResponse> Handle(
    GetApplicationStepQuery query,
    CancellationToken cancellationToken)
  {
    var state = await _store.ReadAsync(query.UserId, cancellationToken);

    return new GetApplicationStepResponse(
      state is null ? null : ToApplicationStepState(state, query.Step));
  }

  public async Task<SaveApplicationStepResponse> Handle(
    SaveApplicationStepCommand command,
    CancellationToken cancellationToken)
  {
    var nextState = await UpsertStateAsync(
      command.UserId,
      command.CustomerId,
      command.LeadId,
      command.Step,
      command.Payload,
      cancellationToken);

    return new SaveApplicationStepResponse(
      ToApplicationStepState(nextState, command.Step));
  }

  public async Task<SubmitApplicationResponse> Handle(
    SubmitApplicationCommand command,
    CancellationToken cancellationToken)
  {
    var nextState = await UpsertStateAsync(
      command.UserId,
      command.CustomerId,
      command.LeadId,
      command.Step,
      command.Payload ?? [],
      cancellationToken);
    var submittedAt = DateTimeOffset.UtcNow.ToString("O");
    var summary = nextState.Summary with
    {
      CurrentStep = command.Step,
      LastUpdatedAt = submittedAt,
    };

    await _store.DeleteAsync(command.UserId, cancellationToken);

    return new SubmitApplicationResponse(summary, submittedAt);
  }

  private async Task<ApplicationFlowState> UpsertStateAsync(
    string userId,
    string? customerId,
    string? leadId,
    string step,
    Dictionary<string, JsonElement> payload,
    CancellationToken cancellationToken)
  {
    var existingState = await _store.ReadAsync(userId, cancellationToken);
    var now = DateTimeOffset.UtcNow.ToString("O");
    var baseSummary = existingState?.Summary ?? new ApplicationFlowSummary(
      Guid.NewGuid().ToString(),
      step,
      now,
      [],
      customerId,
      leadId);
    var nextSummary = baseSummary with
    {
      CustomerId = customerId ?? baseSummary.CustomerId,
      LeadId = leadId ?? baseSummary.LeadId,
      CurrentStep = step,
      CompletedSteps = MergeCompletedSteps(baseSummary.CompletedSteps, step),
      LastUpdatedAt = now,
    };
    var nextState = new ApplicationFlowState(
      existingState?.FlowId ?? Guid.NewGuid().ToString(),
      userId,
      MergePayload(existingState?.FormState, payload),
      nextSummary);

    await _store.WriteAsync(userId, nextState, cancellationToken);

    return nextState;
  }

  private static ApplicationStepState ToApplicationStepState(
    ApplicationFlowState state,
    string step)
  {
    return new ApplicationStepState(
      step,
      ClonePayload(state.FormState),
      state.Summary);
  }

  private static string[] MergeCompletedSteps(
    IEnumerable<string> existingSteps,
    string step)
  {
    var completedSteps = new HashSet<string>(existingSteps, StringComparer.Ordinal)
    {
      step,
    };

    return OrderedSteps.Where(completedSteps.Contains).ToArray();
  }

  private static Dictionary<string, JsonElement> MergePayload(
    Dictionary<string, JsonElement>? existingPayload,
    Dictionary<string, JsonElement> nextPayload)
  {
    var merged = ClonePayload(existingPayload);

    foreach (var (key, value) in nextPayload)
    {
      merged[key] = value.Clone();
    }

    return merged;
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
}

using System.Text.Json;

namespace Acme.Los.Bff.Api.Contracts;

public sealed record ApplicationFlowSummary(
  string ApplicationId,
  string CurrentStep,
  string LastUpdatedAt,
  string[] CompletedSteps,
  string? CustomerId = null,
  string? LeadId = null);

public sealed record ApplicationStepState(
  string Step,
  Dictionary<string, JsonElement> Payload,
  ApplicationFlowSummary Summary);

public sealed record GetApplicationStepResponse(
  ApplicationStepState? StepState);

public sealed record SaveApplicationStepRequest(
  Dictionary<string, JsonElement> Payload);

public sealed record SaveApplicationStepResponse(
  ApplicationStepState StepState);

public sealed record SubmitApplicationRequest(
  string Step,
  Dictionary<string, JsonElement>? Payload = null);

public sealed record SubmitApplicationResponse(
  ApplicationFlowSummary Summary,
  string SubmittedAt);

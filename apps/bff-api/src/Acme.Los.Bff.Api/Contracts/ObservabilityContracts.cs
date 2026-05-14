namespace Acme.Los.Bff.Api.Contracts;

public sealed record ObservabilityEventResponse(
  string AcceptedAt,
  string CorrelationId,
  IReadOnlyList<string> EmittedEvents,
  string EventName,
  string IncomingTraceparent,
  string ParentSpanId,
  string Route,
  string ServerSpanId,
  string ServerTraceparent,
  string TraceFlags,
  string TraceId);

namespace Acme.Los.Bff.Api.Contracts;

public sealed record DiagnosticsTraceRequest(string Route);

public sealed record DiagnosticsTraceResponse(
  string AcceptedAt,
  string CorrelationId,
  IReadOnlyList<string> EmittedEvents,
  string EventName,
  string HandledBy,
  string IncomingTraceparent,
  string ParentSpanId,
  string Route,
  string ServerSpanId,
  string ServerTraceparent,
  string TraceFlags,
  string TraceId);

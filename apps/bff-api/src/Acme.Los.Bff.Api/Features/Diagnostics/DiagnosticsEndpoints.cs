using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.Diagnostics;

public static class DiagnosticsEndpoints
{
  private const string DiagnosticsTraceRoute = "/bff/diagnostics/trace";
  private const string CorrelationIdHeaderName = "x-correlation-id";
  private const string TraceparentHeaderName = "traceparent";
  private const string DiagnosticsTraceEventName = "diagnostics.trace.bff.received";
  private static readonly HashSet<string> AllowedRoutes = ["/logging-demo"];

  private static readonly Regex TraceparentPattern = new(
    "^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

  public static IEndpointRouteBuilder MapBffDiagnosticsEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    endpoints.MapPost(
        DiagnosticsTraceRoute,
        PostDiagnosticsTraceAsync)
      .WithName("PostBffDiagnosticsTrace")
      .Produces<DiagnosticsTraceResponse>(StatusCodes.Status202Accepted)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden);

    return endpoints;
  }

  private static IResult PostDiagnosticsTraceAsync(
    HttpContext context,
    DiagnosticsTraceRequest? payload,
    ICsrfTokenService csrfTokenService,
    ILoggerFactory loggerFactory)
  {
    if (!BffTrustedProxyBoundary.HasTrustedProxyBoundary(context.Request))
    {
      return BffTrustedProxyBoundary.BuildRejectedResult();
    }

    try
    {
      csrfTokenService.ValidateRequest(context.Request);
    }
    catch (InvalidOperationException exception)
    {
      return Results.Json(
        new { error = exception.Message },
        statusCode: StatusCodes.Status400BadRequest);
    }

    if (!TryParseInboundTraceContext(context.Request, out var traceContext))
    {
      return Results.Json(
        new
        {
          message =
            "Valid W3C traceparent and X-Correlation-ID headers are required.",
        },
        statusCode: StatusCodes.Status400BadRequest);
    }

    if (!TryResolveRoute(payload, out var route, out var routeError))
    {
      return Results.Json(
        new { error = routeError },
        statusCode: StatusCodes.Status400BadRequest);
    }

    var acceptedAt = DateTimeOffset.UtcNow.ToString("O");
    var logger = loggerFactory.CreateLogger(
      "Acme.Los.Bff.Api.Features.Diagnostics.Trace");
    var bffSpanId = ResolveCurrentSpanId();
    var bffTraceparent =
      $"00-{traceContext.TraceId}-{bffSpanId}-{traceContext.TraceFlags}";
    var correlationId = context.TraceIdentifier;

    using var scope = logger.BeginScope(
      new Dictionary<string, object?>
      {
        ["CorrelationId"] = correlationId,
        ["TraceId"] = traceContext.TraceId,
        ["TraceFlags"] = traceContext.TraceFlags,
        ["IncomingTraceparent"] = traceContext.Traceparent,
        ["Traceparent"] = bffTraceparent,
        ["ParentSpanId"] = traceContext.ParentSpanId,
        ["SpanId"] = bffSpanId,
        ["Route"] = route,
        ["DiagnosticsEndpoint"] = DiagnosticsTraceRoute,
        ["HandledBy"] = "bff-api",
      });

    logger.LogInformation(
      "Handled BFF diagnostic trace API call. {EventName} {Route} {AcceptedAt}",
      DiagnosticsTraceEventName,
      route,
      acceptedAt);

    context.Response.Headers.CacheControl = "no-store, max-age=0";
    context.Response.Headers[CorrelationIdHeaderName] = correlationId;

    return Results.Json(
      new DiagnosticsTraceResponse(
        acceptedAt,
        correlationId,
        [DiagnosticsTraceEventName],
        DiagnosticsTraceEventName,
        "bff-api",
        traceContext.Traceparent,
        traceContext.ParentSpanId,
        route,
        bffSpanId,
        bffTraceparent,
        traceContext.TraceFlags,
        traceContext.TraceId),
      statusCode: StatusCodes.Status202Accepted);
  }

  private static bool TryResolveRoute(
    DiagnosticsTraceRequest? payload,
    out string route,
    out string error)
  {
    route = payload?.Route.Trim() ?? string.Empty;

    if (!AllowedRoutes.Contains(route))
    {
      error = "A valid demo route is required.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryParseInboundTraceContext(
    HttpRequest request,
    out InboundTraceContext traceContext)
  {
    traceContext = new InboundTraceContext(
      string.Empty,
      string.Empty,
      string.Empty,
      string.Empty);
    var traceparent =
      request.Headers[TraceparentHeaderName].ToString().Trim().ToLowerInvariant();
    var traceparentMatch = TraceparentPattern.Match(traceparent);

    if (string.IsNullOrWhiteSpace(
        request.Headers[CorrelationIdHeaderName].ToString())
      || !traceparentMatch.Success)
    {
      return false;
    }

    var version = traceparentMatch.Groups[1].Value;
    var traceId = traceparentMatch.Groups[2].Value;
    var parentSpanId = traceparentMatch.Groups[3].Value;
    var traceFlags = traceparentMatch.Groups[4].Value;

    if (
      version == "ff"
      || traceId == "00000000000000000000000000000000"
      || parentSpanId == "0000000000000000")
    {
      return false;
    }

    traceContext = new InboundTraceContext(
      traceId,
      parentSpanId,
      traceFlags,
      traceparent);
    return true;
  }

  private static string ResolveCurrentSpanId()
  {
    var spanId = Activity.Current?.SpanId.ToString();

    if (!string.IsNullOrWhiteSpace(spanId) && spanId != "0000000000000000")
    {
      return spanId;
    }

    var bytes = new byte[8];
    string generatedSpanId;

    do
    {
      RandomNumberGenerator.Fill(bytes);
      generatedSpanId = Convert.ToHexString(bytes).ToLowerInvariant();
    } while (generatedSpanId == "0000000000000000");

    return generatedSpanId;
  }

  private sealed record InboundTraceContext(
    string TraceId,
    string ParentSpanId,
    string TraceFlags,
    string Traceparent);
}

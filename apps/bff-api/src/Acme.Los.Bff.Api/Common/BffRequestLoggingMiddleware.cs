using System.Diagnostics;
using System.Text.RegularExpressions;

namespace Acme.Los.Bff.Api.Common;

internal sealed partial class BffRequestLoggingMiddleware
{
  private const string CorrelationIdHeaderName = "x-correlation-id";

  private static readonly Regex CorrelationIdPattern = new(
    "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

  private readonly RequestDelegate _next;
  private readonly ILogger<BffRequestLoggingMiddleware> _logger;

  public BffRequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<BffRequestLoggingMiddleware> logger)
  {
    _next = next;
    _logger = logger;
  }

  public async Task InvokeAsync(HttpContext context)
  {
    var startedAt = Stopwatch.GetTimestamp();
    var correlationId = ResolveCorrelationId(context.Request);
    var method = context.Request.Method;
    var path = context.Request.Path.HasValue
      ? context.Request.Path.Value
      : string.Empty;

    context.TraceIdentifier = correlationId;
    context.Response.OnStarting(() =>
    {
      context.Response.Headers[CorrelationIdHeaderName] = correlationId;
      return Task.CompletedTask;
    });

    var activity = Activity.Current;
    activity?.SetTag("acme.correlation_id", correlationId);

    using var scope = _logger.BeginScope(
      new Dictionary<string, object?>
      {
        ["CorrelationId"] = correlationId,
        ["TraceId"] = activity?.TraceId.ToString(),
        ["SpanId"] = activity?.SpanId.ToString(),
      });

    Exception? requestException = null;

    try
    {
      await _next(context);
    }
    catch (Exception exception)
    {
      requestException = exception;
      activity?.SetStatus(ActivityStatusCode.Error);
      throw;
    }
    finally
    {
      var endpointName = context.GetEndpoint()?.DisplayName;
      var statusCode = context.Response.StatusCode;
      var elapsedMilliseconds =
        Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

      activity?.SetTag("acme.endpoint", endpointName);
      activity?.SetTag("http.response.status_code", statusCode);

      _logger.Log(
        GetLogLevel(statusCode, requestException),
        requestException,
        "BFF request completed {Method} {Path} {Endpoint} {StatusCode} {ElapsedMilliseconds}ms",
        method,
        path,
        endpointName,
        statusCode,
        elapsedMilliseconds);
    }
  }

  private static string ResolveCorrelationId(HttpRequest request)
  {
    var suppliedCorrelationId =
      request.Headers[CorrelationIdHeaderName].ToString().Trim().ToLowerInvariant();

    return CorrelationIdPattern.IsMatch(suppliedCorrelationId)
      ? suppliedCorrelationId
      : Guid.NewGuid().ToString("D");
  }

  private static LogLevel GetLogLevel(
    int statusCode,
    Exception? requestException)
  {
    if (requestException is not null || statusCode >= 500)
    {
      return LogLevel.Error;
    }

    return statusCode >= 400
      ? LogLevel.Warning
      : LogLevel.Information;
  }
}

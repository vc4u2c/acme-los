using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Acme.Los.Bff.Api.Common;
using Acme.Los.Bff.Api.Contracts;
using Acme.Los.Bff.Api.Infrastructure.Security;

namespace Acme.Los.Bff.Api.Features.Observability;

public static class ObservabilityEndpoints
{
  private const string ObservabilityEventsEnabledEnvironmentName =
    "ACME_BFF_OBSERVABILITY_EVENTS_ENABLED";
  private const string ObservabilityEventsRoute = "/bff/observability/events";
  private const string CorrelationIdHeaderName = "x-correlation-id";
  private const string TraceparentHeaderName = "traceparent";

  private static readonly Regex CorrelationIdPattern = new(
    "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

  private static readonly Regex TraceparentPattern = new(
    "^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

  private static readonly Regex ShowcaseGridIdPattern = new(
    "^GRID-\\d{4}$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant);

  private static readonly Regex ShowcaseGridDemoTextPattern = new(
    "^[a-zA-Z0-9 .&'-]+$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant);

  private static readonly HashSet<string> VisibilityStates =
  [
    "hidden",
    "visible",
    "prerender",
    "unloaded",
  ];

  private static readonly HashSet<string> ShowcaseGridOfficers =
  [
    "Avery Chen",
    "Morgan Patel",
    "Riley Brooks",
    "Samira King",
    "Taylor Reed",
  ];

  private static readonly HashSet<string> ShowcaseGridProducts =
  [
    "Working capital",
    "Equipment",
    "Expansion",
    "Refinance",
  ];

  private static readonly HashSet<string> ShowcaseGridRegions =
  [
    "Central",
    "Northeast",
    "Southeast",
    "West",
  ];

  private static readonly HashSet<string> ShowcaseGridRiskGrades =
  [
    "A",
    "B",
    "C",
    "D",
  ];

  private static readonly HashSet<string> ShowcaseGridStatuses =
  [
    "Draft",
    "Review",
    "Conditional",
    "Approved",
    "Funded",
  ];

  private static readonly HashSet<string> ShowcaseGridVisibleQueryStatuses =
  [
    "all",
    "Draft",
    "Review",
    "Conditional",
    "Approved",
    "Funded",
  ];

  public static IEndpointRouteBuilder MapBffObservabilityEndpoints(
    this IEndpointRouteBuilder endpoints)
  {
    endpoints.MapPost(
        ObservabilityEventsRoute,
        PostObservabilityEventAsync)
      .WithName("PostBffObservabilityEvent")
      .Produces<ObservabilityEventResponse>(StatusCodes.Status202Accepted)
      .Produces(StatusCodes.Status400BadRequest)
      .Produces(StatusCodes.Status403Forbidden)
      .Produces(StatusCodes.Status404NotFound);

    return endpoints;
  }

  private static async Task<IResult> PostObservabilityEventAsync(
    HttpContext context,
    ICsrfTokenService csrfTokenService,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken)
  {
    if (!IsObservabilityEventsEnabled())
    {
      return Results.Json(
        new { message = "Not found." },
        statusCode: StatusCodes.Status404NotFound);
    }

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

    var acceptedAt = DateTimeOffset.UtcNow.ToString("O");
    var logger = loggerFactory.CreateLogger(
      "Acme.Los.Bff.Api.Features.Observability.Events");

    try
    {
      using var document = await JsonDocument.ParseAsync(
        context.Request.Body,
        cancellationToken: cancellationToken);

      if (
        !TryParseObservabilityEventPayload(
          document.RootElement,
          out var payload,
          out var validationError))
      {
        logger.LogWarning(
          "Rejected BFF observability event payload. {AcceptedAt} {ValidationError}",
          acceptedAt,
          validationError);

        return Results.Json(
          new { message = "Unable to write observability event." },
          statusCode: StatusCodes.Status400BadRequest);
      }

      var serverSpanId = CreateServerSpanId();
      var serverTraceparent =
        $"00-{traceContext.TraceId}-{serverSpanId}-{traceContext.TraceFlags}";

      using var scope = logger.BeginScope(
        new Dictionary<string, object?>
        {
          ["CorrelationId"] = traceContext.CorrelationId,
          ["TraceId"] = traceContext.TraceId,
          ["TraceFlags"] = traceContext.TraceFlags,
          ["IncomingTraceparent"] = traceContext.Traceparent,
          ["Traceparent"] = serverTraceparent,
          ["ParentSpanId"] = traceContext.ParentSpanId,
          ["SpanId"] = serverSpanId,
          ["Route"] = payload.Route,
          ["ObservabilityEndpoint"] = ObservabilityEventsRoute,
          ["RequestedEvent"] = payload.EventName,
          ["HandledBy"] = "bff-api",
        });

      var emittedEvents = EmitObservabilityLogs(logger, payload, acceptedAt);

      context.Response.Headers.CacheControl = "no-store, max-age=0";
      context.Response.Headers[CorrelationIdHeaderName] = traceContext.CorrelationId;

      return Results.Json(
        new ObservabilityEventResponse(
          acceptedAt,
          traceContext.CorrelationId,
          emittedEvents,
          payload.EventName,
          "bff-api",
          traceContext.Traceparent,
          traceContext.ParentSpanId,
          payload.Route,
          serverSpanId,
          serverTraceparent,
          traceContext.TraceFlags,
          traceContext.TraceId),
        statusCode: StatusCodes.Status202Accepted);
    }
    catch (JsonException exception)
    {
      logger.LogWarning(
        exception,
        "Rejected malformed BFF observability event payload. {AcceptedAt}",
        acceptedAt);

      return Results.Json(
        new { message = "Unable to write observability event." },
        statusCode: StatusCodes.Status400BadRequest);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (Exception exception)
    {
      logger.LogError(
        exception,
        "BFF observability event failed. {AcceptedAt} {CorrelationId} {TraceId}",
        acceptedAt,
        traceContext.CorrelationId,
        traceContext.TraceId);

      return Results.Json(
        new { message = "Unable to write observability event." },
        statusCode: StatusCodes.Status400BadRequest);
    }
  }

  private static bool IsObservabilityEventsEnabled()
  {
    var configuredValue =
      Environment.GetEnvironmentVariable(ObservabilityEventsEnabledEnvironmentName);

    return configuredValue?.Trim().ToLowerInvariant() is "1" or "true" or "yes" or "on";
  }

  private static IReadOnlyList<string> EmitObservabilityLogs(
    ILogger logger,
    ObservabilityEventPayload payload,
    string acceptedAt)
  {
    if (payload.EventName == "logging.demo.client.received")
    {
      logger.LogInformation(
        "Received browser telemetry for logging demo trace. {EventName} {Route} {AcceptedAt} {ClientTelemetry}",
        payload.EventName,
        payload.Route,
        acceptedAt,
        payload.ClientTelemetry.GetValueOrDefault());

      logger.LogInformation(
        "Processed logging demo trace on the BFF. {EventName} {Route} {AcceptedAt}",
        "logging.demo.server.processed",
        payload.Route,
        acceptedAt);

      return
      [
        "logging.demo.client.received",
        "logging.demo.server.processed",
      ];
    }

    if (payload.EventName == "logging.demo.client.error.received")
    {
      logger.LogError(
        "Received controlled client-side logging demo error. {EventName} {Route} {AcceptedAt} {ClientError} {ClientTelemetry}",
        payload.EventName,
        payload.Route,
        acceptedAt,
        payload.ClientError.GetValueOrDefault(),
        payload.ClientTelemetry.GetValueOrDefault());

      return ["logging.demo.client.error.received"];
    }

    if (payload.EventName == "logging.demo.server.error")
    {
      try
      {
        throw new InvalidOperationException(
          "Controlled logging demo server error.");
      }
      catch (InvalidOperationException exception)
      {
        logger.LogError(
          exception,
          "Captured controlled server-side logging demo error. {EventName} {Route} {AcceptedAt} {ErrorName} {ErrorMessage}",
          payload.EventName,
          payload.Route,
          acceptedAt,
          exception.GetType().Name,
          exception.Message);
      }

      return ["logging.demo.server.error"];
    }

    if (payload.EventName == "showcase.grid.submit")
    {
      logger.LogInformation(
        "Received bounded showcase grid edit submission. {EventName} {Route} {AcceptedAt} {GridSubmission}",
        payload.EventName,
        payload.Route,
        acceptedAt,
        payload.GridSubmission.GetValueOrDefault());

      return ["showcase.grid.submit"];
    }

    logger.LogInformation(
      "Emitted API-handled logging demo event. {EventName} {Route} {AcceptedAt}",
      payload.EventName,
      payload.Route,
      acceptedAt);

    return ["logging.demo.server.manual"];
  }

  private static bool TryParseObservabilityEventPayload(
    JsonElement root,
    out ObservabilityEventPayload payload,
    out string error)
  {
    payload = new ObservabilityEventPayload(string.Empty, string.Empty);
    error = string.Empty;

    if (root.ValueKind != JsonValueKind.Object)
    {
      error = "The observability event payload must be a JSON object.";
      return false;
    }

    if (!TryGetBoundedString(root, "eventName", 128, out var eventName, out error))
    {
      return false;
    }

    if (!TryGetBoundedString(root, "route", 256, out var route, out error))
    {
      return false;
    }

    if (eventName == "logging.demo.client.received")
    {
      if (
        !TryGetRequiredObject(
          root,
          "clientTelemetry",
          out var clientTelemetry,
          out error)
        || !TryValidateClientTelemetry(clientTelemetry, out error))
      {
        return false;
      }

      payload = new ObservabilityEventPayload(
        eventName,
        route,
        ClientTelemetry: clientTelemetry);
      return true;
    }

    if (eventName == "logging.demo.client.error.received")
    {
      if (
        !TryGetRequiredObject(
          root,
          "clientTelemetry",
          out var clientTelemetry,
          out error)
        || !TryValidateClientTelemetry(clientTelemetry, out error)
        || !TryGetRequiredObject(root, "clientError", out var clientError, out error)
        || !TryValidateClientError(clientError, out error))
      {
        return false;
      }

      payload = new ObservabilityEventPayload(
        eventName,
        route,
        ClientTelemetry: clientTelemetry,
        ClientError: clientError);
      return true;
    }

    if (eventName == "logging.demo.server.error")
    {
      payload = new ObservabilityEventPayload(eventName, route);
      return true;
    }

    if (eventName == "showcase.grid.submit")
    {
      if (
        !TryGetRequiredObject(
          root,
          "gridSubmission",
          out var gridSubmission,
          out error)
        || !TryValidateShowcaseGridSubmission(gridSubmission, out error))
      {
        return false;
      }

      payload = new ObservabilityEventPayload(
        eventName,
        route,
        GridSubmission: gridSubmission);
      return true;
    }

    if (eventName == "logging.demo.server.manual")
    {
      payload = new ObservabilityEventPayload(eventName, route);
      return true;
    }

    error = $"Unsupported observability event '{eventName}'.";
    return false;
  }

  private static bool TryValidateClientTelemetry(
    JsonElement clientTelemetry,
    out string error)
  {
    if (
      !TryGetBoundedString(clientTelemetry, "emittedAt", 64, out _, out error)
      || !TryGetBoundedString(clientTelemetry, "pageUrl", 512, out _, out error)
      || !TryValidateOptionalBoundedString(clientTelemetry, "referrer", 512, out error)
      || !TryGetBoundedString(clientTelemetry, "userAgent", 512, out _, out error)
      || !TryGetBoundedString(clientTelemetry, "language", 64, out _, out error)
      || !TryValidateBoundedStringArray(clientTelemetry, "languages", 8, 64, out error)
      || !TryGetBoundedString(clientTelemetry, "timeZone", 128, out _, out error)
      || !TryValidateEnum(clientTelemetry, "visibilityState", VisibilityStates, out error)
      || !TryValidateOptionalInteger(clientTelemetry, "hardwareConcurrency", 0, 256, out error)
      || !TryValidateOptionalNumber(clientTelemetry, "deviceMemory", 0, 1024, out error)
      || !TryGetRequiredObject(clientTelemetry, "viewport", out var viewport, out error)
      || !TryValidateInteger(viewport, "width", 0, 20_000, out error)
      || !TryValidateInteger(viewport, "height", 0, 20_000, out error)
      || !TryGetRequiredObject(clientTelemetry, "screen", out var screen, out error)
      || !TryValidateInteger(screen, "width", 0, 20_000, out error)
      || !TryValidateInteger(screen, "height", 0, 20_000, out error)
      || !TryValidateInteger(screen, "colorDepth", 0, 128, out error)
      || !TryValidateNumber(screen, "pixelRatio", 0, 20, out error))
    {
      return false;
    }

    if (
      clientTelemetry.TryGetProperty("connection", out var connection)
      && (
        connection.ValueKind != JsonValueKind.Object
        || !TryValidateOptionalBoundedString(connection, "effectiveType", 32, out error)
        || !TryValidateOptionalNumber(connection, "downlink", 0, 100_000, out error)
        || !TryValidateOptionalInteger(connection, "rtt", 0, 120_000, out error)
        || !TryValidateOptionalBoolean(connection, "saveData", out error)))
    {
      if (string.IsNullOrWhiteSpace(error))
      {
        error = "The 'connection' field must be an object.";
      }

      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateClientError(
    JsonElement clientError,
    out string error)
  {
    return TryGetBoundedString(clientError, "name", 128, out _, out error)
      && TryGetBoundedString(clientError, "message", 512, out _, out error);
  }

  private static bool TryValidateShowcaseGridSubmission(
    JsonElement gridSubmission,
    out string error)
  {
    if (
      !TryGetRequiredArray(gridSubmission, "deletedRowIds", 50, out var deletedRowIds, out error)
      || !TryValidateGridIds(deletedRowIds, out error)
      || !TryGetRequiredArray(gridSubmission, "editedRows", 25, out var editedRows, out error)
      || !TryValidateShowcaseGridRows(editedRows, out error)
      || !TryGetBoundedString(gridSubmission, "submittedAt", 64, out _, out error)
      || !TryGetRequiredObject(gridSubmission, "visibleQuery", out var visibleQuery, out error)
      || !TryGetBoundedString(visibleQuery, "filter", 80, out _, out error)
      || !TryValidateInteger(visibleQuery, "pageIndex", 0, 100, out error)
      || !TryValidateInteger(visibleQuery, "pageSize", 5, 25, out error)
      || !TryGetRequiredArray(visibleQuery, "sorting", 1, out var sorting, out error)
      || !TryValidateShowcaseGridSorting(sorting, out error)
      || !TryValidateOptionalEnum(
        visibleQuery,
        "status",
        ShowcaseGridVisibleQueryStatuses,
        out error))
    {
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateGridIds(
    JsonElement ids,
    out string error)
  {
    error = string.Empty;

    foreach (var id in ids.EnumerateArray())
    {
      if (
        id.ValueKind != JsonValueKind.String
        || !TryValidateGridId(id.GetString(), out error))
      {
        return false;
      }
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateShowcaseGridRows(
    JsonElement rows,
    out string error)
  {
    error = string.Empty;

    foreach (var row in rows.EnumerateArray())
    {
      if (
        row.ValueKind != JsonValueKind.Object
        || !TryValidateInteger(row, "amount", 25_000, 5_000_000, out error)
        || !TryGetBoundedString(row, "borrower", 80, out var borrower, out error)
        || !ShowcaseGridDemoTextPattern.IsMatch(borrower)
        || !TryGetBoundedString(row, "id", 32, out var id, out error)
        || !TryValidateGridId(id, out error)
        || !TryValidateInteger(row, "ltv", 0, 100, out error)
        || !TryValidateEnum(row, "officer", ShowcaseGridOfficers, out error)
        || !TryValidateEnum(row, "product", ShowcaseGridProducts, out error)
        || !TryValidateNumber(row, "rate", 0, 30, out error)
        || !TryValidateEnum(row, "region", ShowcaseGridRegions, out error)
        || !TryValidateEnum(row, "riskGrade", ShowcaseGridRiskGrades, out error)
        || !TryValidateEnum(row, "status", ShowcaseGridStatuses, out error))
      {
        if (string.IsNullOrWhiteSpace(error))
        {
          error = "The showcase grid row contains invalid text.";
        }

        return false;
      }
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateShowcaseGridSorting(
    JsonElement sorting,
    out string error)
  {
    error = string.Empty;

    foreach (var sort in sorting.EnumerateArray())
    {
      if (
        sort.ValueKind != JsonValueKind.Object
        || !TryValidateBoolean(sort, "desc", out error)
        || !TryGetBoundedString(sort, "id", 64, out _, out error))
      {
        if (string.IsNullOrWhiteSpace(error))
        {
          error = "The showcase grid sorting item must be an object.";
        }

        return false;
      }
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateGridId(string? value, out string error)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      error = "A showcase grid id is required.";
      return false;
    }

    var trimmedValue = value.Trim();

    if (trimmedValue.Length > 32 || !ShowcaseGridIdPattern.IsMatch(trimmedValue))
    {
      error = "A showcase grid id must match GRID-0000.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryGetRequiredObject(
    JsonElement source,
    string propertyName,
    out JsonElement value,
    out string error)
  {
    value = default;

    if (
      !source.TryGetProperty(propertyName, out value)
      || value.ValueKind != JsonValueKind.Object)
    {
      error = $"The '{propertyName}' field must be an object.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryGetRequiredArray(
    JsonElement source,
    string propertyName,
    int maxLength,
    out JsonElement value,
    out string error)
  {
    value = default;

    if (
      !source.TryGetProperty(propertyName, out value)
      || value.ValueKind != JsonValueKind.Array)
    {
      error = $"The '{propertyName}' field must be an array.";
      return false;
    }

    if (value.GetArrayLength() > maxLength)
    {
      error = $"The '{propertyName}' array contains too many items.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryGetBoundedString(
    JsonElement source,
    string propertyName,
    int maxLength,
    out string value,
    out string error)
  {
    value = string.Empty;

    if (
      !source.TryGetProperty(propertyName, out var element)
      || element.ValueKind != JsonValueKind.String)
    {
      error = $"The '{propertyName}' field must be a string.";
      return false;
    }

    var trimmedValue = element.GetString()?.Trim() ?? string.Empty;

    if (trimmedValue.Length > maxLength)
    {
      error = $"The '{propertyName}' field is too long.";
      return false;
    }

    value = trimmedValue;
    error = string.Empty;
    return true;
  }

  private static bool TryValidateOptionalBoundedString(
    JsonElement source,
    string propertyName,
    int maxLength,
    out string error)
  {
    if (!source.TryGetProperty(propertyName, out var element))
    {
      error = string.Empty;
      return true;
    }

    if (element.ValueKind != JsonValueKind.String)
    {
      error = $"The '{propertyName}' field must be a string.";
      return false;
    }

    var trimmedValue = element.GetString()?.Trim() ?? string.Empty;

    if (trimmedValue.Length > maxLength)
    {
      error = $"The '{propertyName}' field is too long.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateBoundedStringArray(
    JsonElement source,
    string propertyName,
    int maxItems,
    int maxItemLength,
    out string error)
  {
    if (!TryGetRequiredArray(source, propertyName, maxItems, out var array, out error))
    {
      return false;
    }

    foreach (var item in array.EnumerateArray())
    {
      if (
        item.ValueKind != JsonValueKind.String
        || (item.GetString()?.Trim().Length ?? 0) > maxItemLength)
      {
        error = $"The '{propertyName}' array contains an invalid string.";
        return false;
      }
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateInteger(
    JsonElement source,
    string propertyName,
    int min,
    int max,
    out string error)
  {
    if (
      !source.TryGetProperty(propertyName, out var element)
      || element.ValueKind != JsonValueKind.Number
      || !element.TryGetInt32(out var value)
      || value < min
      || value > max)
    {
      error = $"The '{propertyName}' field must be an integer between {min} and {max}.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateOptionalInteger(
    JsonElement source,
    string propertyName,
    int min,
    int max,
    out string error)
  {
    if (!source.TryGetProperty(propertyName, out var element))
    {
      error = string.Empty;
      return true;
    }

    if (
      element.ValueKind != JsonValueKind.Number
      || !element.TryGetInt32(out var value)
      || value < min
      || value > max)
    {
      error = $"The '{propertyName}' field must be an integer between {min} and {max}.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateNumber(
    JsonElement source,
    string propertyName,
    double min,
    double max,
    out string error)
  {
    if (
      !source.TryGetProperty(propertyName, out var element)
      || element.ValueKind != JsonValueKind.Number
      || !element.TryGetDouble(out var value)
      || double.IsNaN(value)
      || double.IsInfinity(value)
      || value < min
      || value > max)
    {
      error = $"The '{propertyName}' field must be a number between {min} and {max}.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateOptionalNumber(
    JsonElement source,
    string propertyName,
    double min,
    double max,
    out string error)
  {
    if (!source.TryGetProperty(propertyName, out var element))
    {
      error = string.Empty;
      return true;
    }

    if (
      element.ValueKind != JsonValueKind.Number
      || !element.TryGetDouble(out var value)
      || double.IsNaN(value)
      || double.IsInfinity(value)
      || value < min
      || value > max)
    {
      error = $"The '{propertyName}' field must be a number between {min} and {max}.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateBoolean(
    JsonElement source,
    string propertyName,
    out string error)
  {
    if (
      !source.TryGetProperty(propertyName, out var element)
      || element.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
    {
      error = $"The '{propertyName}' field must be a boolean.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateOptionalBoolean(
    JsonElement source,
    string propertyName,
    out string error)
  {
    if (!source.TryGetProperty(propertyName, out var element))
    {
      error = string.Empty;
      return true;
    }

    if (element.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
    {
      error = $"The '{propertyName}' field must be a boolean.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateEnum(
    JsonElement source,
    string propertyName,
    HashSet<string> allowedValues,
    out string error)
  {
    if (!TryGetBoundedString(source, propertyName, 128, out var value, out error))
    {
      return false;
    }

    if (!allowedValues.Contains(value))
    {
      error = $"The '{propertyName}' field contains an unsupported value.";
      return false;
    }

    error = string.Empty;
    return true;
  }

  private static bool TryValidateOptionalEnum(
    JsonElement source,
    string propertyName,
    HashSet<string> allowedValues,
    out string error)
  {
    if (!source.TryGetProperty(propertyName, out var element))
    {
      error = string.Empty;
      return true;
    }

    if (
      element.ValueKind != JsonValueKind.String
      || !allowedValues.Contains(element.GetString()?.Trim() ?? string.Empty))
    {
      error = $"The '{propertyName}' field contains an unsupported value.";
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
      string.Empty,
      string.Empty);
    var correlationId =
      request.Headers[CorrelationIdHeaderName].ToString().Trim().ToLowerInvariant();
    var traceparent =
      request.Headers[TraceparentHeaderName].ToString().Trim().ToLowerInvariant();
    var traceparentMatch = TraceparentPattern.Match(traceparent);

    if (!CorrelationIdPattern.IsMatch(correlationId) || !traceparentMatch.Success)
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
      correlationId,
      traceId,
      parentSpanId,
      traceFlags,
      traceparent);
    return true;
  }

  private static string CreateServerSpanId()
  {
    var bytes = new byte[8];
    string spanId;

    do
    {
      RandomNumberGenerator.Fill(bytes);
      spanId = Convert.ToHexString(bytes).ToLowerInvariant();
    } while (spanId == "0000000000000000");

    return spanId;
  }

  private sealed record ObservabilityEventPayload(
    string EventName,
    string Route,
    JsonElement? ClientTelemetry = null,
    JsonElement? ClientError = null,
    JsonElement? GridSubmission = null);

  private sealed record InboundTraceContext(
    string CorrelationId,
    string TraceId,
    string ParentSpanId,
    string TraceFlags,
    string Traceparent);
}

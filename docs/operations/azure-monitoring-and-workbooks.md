# Azure Monitoring And Workbooks

This doc captures the current Azure-native observability model for ACME LOS.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Azure infrastructure scaffold](../../infra/azure/README.md)
- [Current platform architecture](../architecture/current-platform.md)

## Current Direction

The current monitoring stack is intentionally Azure-native:

- `Application Insights`
  - application traces
  - exceptions
  - dependencies
  - app-emitted logs
- `Log Analytics`
  - workspace backing for Application Insights
  - ACA console logs
  - ACA platform/system logs
- `Azure Monitor Workbooks`
  - operational dashboard for support and platform troubleshooting
- `Azure Monitor log alerts`
  - failure and health signals surfaced as Azure alerts

This keeps the first operations surface cohesive without introducing a second
observability platform like Kibana, Prometheus, or Grafana too early.

Current ownership split:

- platform subscription:
  - `Log Analytics`
  - `Application Insights`
  - workbooks
  - alerting
- workload subscription:
  - ACA runtime
  - workload VNet and subnets
  - private endpoints
  - Key Vault
  - Redis

## Current Live Dev State

The current `dev` environment in `sub-acme-nonprod-online` now deploys:

- platform monitoring resource group in `sub-acme-platform`:
  - `rg-acme-hub-monitor-cus-01`
- `Log Analytics`:
  - `log-acme-los-dev-cus-01`
- `Application Insights`:
  - `appi-acme-los-dev-cus-01`

- workbook display name:
  - `wbk-acme-los-ops-dev-cus-01`
- action group:
  - `ag-acme-los-ops-dev-cus-01`
- log alerts:
  - `alrt-acme-los-failed-requests-dev-cus-01`
  - `alrt-acme-los-exceptions-dev-cus-01`
  - `alrt-acme-los-auth-failures-dev-cus-01`
  - `alrt-acme-los-system-errors-dev-cus-01`

Important note:

- the action group exists now
- it is the right Azure-native attachment point for future notifications
- but it does not yet have email, Teams, webhook, or paging receivers configured

That means alerts are now created and visible in Azure Monitor, but receiver
delivery still needs to be wired deliberately.

## Data Flow

### App Telemetry

The Node web runtime starts with the Azure Monitor OpenTelemetry distro before
the standalone Next server boots.

Current app telemetry behavior:

- `HTTP` requests and dependencies emit traces automatically
- `AppRequests`, `AppDependencies`, and `AppExceptions` are available in the
  workspace-backed Application Insights tables
- `/api/health` is filtered out of App Insights to avoid probe noise
- sampling stays rate-limited:
  - `dev`, `qa`, `stg`: `2` traces per second
  - `prod`: `5` traces per second

### App Logs

The shared logger in [logger.ts](../../libs/core/logger/src/lib/logger.ts) now
does two things for every log event:

- writes structured JSON to stdout or stderr
- emits the same log event through the OpenTelemetry logs API

That gives us both:

- `ACA` console logs in `Log Analytics`
- application log records in `Application Insights`

Current practical meaning:

- support teams can inspect the raw container output in workspace log tables
- platform and app teams can also query app logs alongside requests,
  dependencies, and exceptions inside the Application Insights data model

### Browser-Origin Logs

Browser console logs do not naturally appear in ACA container logs. When a demo
or product workflow needs client-side behavior to be visible in the operational
log stream, the browser should send a small, allowlisted telemetry payload to a
server endpoint. The server validates it and writes the final structured event
through the shared logger.

Server-side `info`, `warn`, and `error` logs should not call this endpoint.
Server code should use the shared logger directly. The HTTP endpoint exists for
browser-origin events because the browser cannot write to ACA stdout or the
server-side Application Insights exporter by itself.

The `/logging-demo` route follows that pattern through the generic
`POST /api/observability/events` endpoint:

- server render emits `logging.demo.server.render`
- traced flow emits a local browser console event as
  `logging.demo.client.browser`
- every button action creates a fresh W3C `traceparent` header
- every button action also sends a fresh `X-Correlation-ID` header for
  demo/business correlation; this is separate from distributed tracing
- the browser posts an allowlisted event name and bounded telemetry payload with
  that trace context to the server
- the server writes paired container log events:
  `logging.demo.client.received` and `logging.demo.server.processed`
- standalone API-handled action emits `logging.demo.server.manual`
- controlled error actions emit `logging.demo.client.error.received` and
  `logging.demo.server.error`
- server logs include the extracted `traceId`, `parentSpanId`, `spanId`, and
  `traceparent` fields plus `incomingTraceparent` and `correlationId` for
  simple Log Analytics and Application Insights queries
- the shared logger enriches every server log with `application`, `service`,
  `environment`, `nodeEnv`, `version`, `build`, and `timestamp`
- logger emission is fire-and-forget; request handling does not await a logging
  transport before continuing
- the UI shows the full correlation id, trace id, incoming `traceparent`, server
  `traceparent`, browser span id, and server span id so operators can paste the
  exact values into Kusto

Local browser logs and local Next.js server logs do not go to the deployed dev
Application Insights resource unless a local process is deliberately configured
with that exporter/connection string. Keep normal local development telemetry
local so the `dev` signal stays clean.

The implementation uses the shared `@acme-los/core/logger` trace logger on the
server, the runtime-neutral `@acme-los/core/logger/trace-context` helpers for
header names and W3C parsing, the generic `/api/observability/events` route,
and a small browser trace logger helper under the web app. Keep future
client-to-server telemetry flows on that shape: typed event name, W3C
`traceparent`, optional `X-Correlation-ID` for business correlation,
allowlisted payload, server validation, then structured server log emission. Do
not invent a custom `X-TraceId` header unless a legacy integration specifically
requires one.

For product browser events, call the endpoint as a best-effort background
operation so user workflows do not wait on telemetry delivery. Normal
server-side `info`, `warn`, and `error` logs skip the endpoint and use the
shared logger directly. The demo awaits the endpoint response only because it
needs to display the full correlation and trace identifiers for the operator.

Do not use this path for arbitrary client blobs, cookies, bearer tokens, form
values, or customer PII.

### Trace And Correlation Queries

Use the full correlation id from the logging demo UI when you want the
business/demo story for one button click. Use the trace id when you want the
distributed tracing story across the browser-origin event, server event, and
future downstream services.

Copy and run one Kusto block at a time. If the portal reports a token like
`asclet`, the previous query's `asc` and the next query's `let` were pasted
together without clearing the query window or preserving a separator.

Application Insights app traces by correlation id.

Run this from the `log-acme-los-dev-cus-01` Log Analytics workspace or the
`appi-acme-los-dev-cus-01` Application Insights resource. If `AppTraces` does
not resolve, the Logs blade is scoped to the wrong resource.

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
AppTraces
| where TimeGenerated > ago(2h)
| extend props = todynamic(Properties)
| extend
    clientError = parse_json(tostring(props.clientError)),
    clientTelemetry = parse_json(tostring(props.clientTelemetry))
| extend
    event = tostring(props.event),
    correlationId = tostring(props.correlationId),
    traceId = tostring(props.traceId),
    spanId = tostring(props.spanId),
    parentSpanId = tostring(props.parentSpanId),
    incomingTraceparent = tostring(props.incomingTraceparent),
    traceparent = tostring(props.traceparent),
    route = tostring(props.route),
    environment = tostring(props.environment),
    service = tostring(props.service),
    version = tostring(props.version),
    build = tostring(props.build),
    clientErrorName = tostring(clientError.name),
    clientErrorMessage = tostring(clientError.message),
    clientPageUrl = tostring(clientTelemetry.pageUrl),
    clientReferrer = tostring(clientTelemetry.referrer),
    clientUserAgent = tostring(clientTelemetry.userAgent),
    clientLanguage = tostring(clientTelemetry.language),
    clientTimeZone = tostring(clientTelemetry.timeZone),
    clientVisibilityState = tostring(clientTelemetry.visibilityState),
    clientViewportWidth = toint(clientTelemetry.viewport.width),
    clientViewportHeight = toint(clientTelemetry.viewport.height),
    clientScreenWidth = toint(clientTelemetry.screen.width),
    clientScreenHeight = toint(clientTelemetry.screen.height),
    clientPixelRatio = todouble(clientTelemetry.screen.pixelRatio),
    clientConnectionType = tostring(clientTelemetry.connection.effectiveType)
| where correlationId == targetCorrelationId
| project
    TimeGenerated,
    SeverityLevel,
    Message,
    event,
    correlationId,
    traceId,
    spanId,
    parentSpanId,
    incomingTraceparent,
    traceparent,
    route,
    environment,
    service,
    version,
    build,
    clientErrorName,
    clientErrorMessage,
    clientPageUrl,
    clientReferrer,
    clientUserAgent,
    clientLanguage,
    clientTimeZone,
    clientVisibilityState,
    clientViewportWidth,
    clientViewportHeight,
    clientScreenWidth,
    clientScreenHeight,
    clientPixelRatio,
    clientConnectionType
| order by TimeGenerated asc;
```

ACA container logs by correlation id.

Run this from the `log-acme-los-dev-cus-01` Log Analytics workspace. The current
`dev` workspace exposes Container Apps console logs as
`ContainerAppConsoleLogs_CL`.

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
let containerAppName = 'ca-acme-los-web-dev-cus-01';
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(2h)
| extend
    ContainerApp = tostring(ContainerAppName_s),
    RevisionName = tostring(RevisionName_s),
    LogMessage = tostring(Log_s)
| where ContainerApp =~ containerAppName
| extend payload = parse_json(LogMessage)
| extend
    clientError = payload.clientError,
    clientTelemetry = payload.clientTelemetry
| extend
    event = tostring(payload.event),
    correlationId = tostring(payload.correlationId),
    traceId = tostring(payload.traceId),
    spanId = tostring(payload.spanId),
    parentSpanId = tostring(payload.parentSpanId),
    incomingTraceparent = tostring(payload.incomingTraceparent),
    traceparent = tostring(payload.traceparent),
    route = tostring(payload.route),
    environment = tostring(payload.environment),
    service = tostring(payload.service),
    version = tostring(payload.version),
    build = tostring(payload.build),
    clientErrorName = tostring(clientError.name),
    clientErrorMessage = tostring(clientError.message),
    clientPageUrl = tostring(clientTelemetry.pageUrl),
    clientReferrer = tostring(clientTelemetry.referrer),
    clientUserAgent = tostring(clientTelemetry.userAgent),
    clientLanguage = tostring(clientTelemetry.language),
    clientTimeZone = tostring(clientTelemetry.timeZone),
    clientVisibilityState = tostring(clientTelemetry.visibilityState),
    clientViewportWidth = toint(clientTelemetry.viewport.width),
    clientViewportHeight = toint(clientTelemetry.viewport.height),
    clientScreenWidth = toint(clientTelemetry.screen.width),
    clientScreenHeight = toint(clientTelemetry.screen.height),
    clientPixelRatio = todouble(clientTelemetry.screen.pixelRatio),
    clientConnectionType = tostring(clientTelemetry.connection.effectiveType)
| where correlationId == targetCorrelationId
| project
    TimeGenerated,
    RevisionName,
    level = tostring(payload.level),
    message = tostring(payload.message),
    event,
    correlationId,
    traceId,
    spanId,
    parentSpanId,
    incomingTraceparent,
    traceparent,
    route,
    environment,
    service,
    version,
    build,
    clientErrorName,
    clientErrorMessage,
    clientPageUrl,
    clientReferrer,
    clientUserAgent,
    clientLanguage,
    clientTimeZone,
    clientVisibilityState,
    clientViewportWidth,
    clientViewportHeight,
    clientScreenWidth,
    clientScreenHeight,
    clientPixelRatio,
    clientConnectionType
| order by TimeGenerated asc;
```

### Future .NET Services

Future .NET services should keep the same operational contract:

- structured JSON logs to stdout/stderr for ACA console logs
- OpenTelemetry-compatible traces and logs for Application Insights
- stable, language-neutral event names and trace fields
- accept and propagate the standard W3C `traceparent` header so ASP.NET
  request/dependency telemetry joins the same distributed trace
- accept and forward `X-Correlation-ID` when the caller provides it, while
  treating it as business/process correlation instead of a tracing replacement
- the same platform-owned Log Analytics and Application Insights resources

## Workbook Scope

The per-environment workbook is meant to be the first operational dashboard for
support and engineering.

Implementation note:

- the workbook JSON is authored from the repo template and synced after deploy
- Azure ARM workbook GET responses still do not echo `serializedData` back in a useful way for validation
- so the deploy path treats workbook publishing as an explicit sync step instead of relying on stack outputs for proof of content

Current workbook sections:

- service summary over the last `24h`
  - total requests
  - failed requests
  - failure rate
  - p95 duration
  - exception count
  - warning/error log counts
  - dependency failure count
- request and failed-request trend over time
- recent failed requests
- recent exceptions
- dependency health summary
- auth and security event summary
- container console warnings and errors
- container platform events

Current workbook query sources:

- workspace-backed Application Insights tables:
  - `AppRequests`
  - `AppDependencies`
  - `AppExceptions`
  - `AppTraces`
- ACA workspace tables:
  - `ContainerAppConsoleLogs_CL`
  - `ContainerAppSystemLogs_CL`

The current `dev` workspace exposes Container Apps tables with the `_CL` suffix.
If a future workspace exposes non-suffixed table names instead, translate the
table and column names deliberately rather than running the query from the wrong
Logs scope.

The workbook is environment-scoped today. Later, when `qa`, `stg`, and `prod`
are active, we can decide whether to keep per-environment workbooks only or add
a platform-level aggregate workbook in the platform monitoring resource group.

## Current Alert Rules

Current log alerts focus on the first signals support teams actually need:

1. failed request spike
2. exception spike
3. auth and security failures spike
4. container platform/system errors

Current design choices:

- alerts query the shared workspace so one environment can see both app and ACA
  signals
- alerts filter to the ACME LOS web runtime instead of querying every service in
  the workspace
- thresholds are stricter in `prod` than in non-production

## What Is Still Deliberately Missing

This is a strong first Azure Monitor slice, but not the final operations model.

Still intentionally pending:

- notification receivers on the action groups
- synthetic availability tests
- platform-level aggregate workbook across all environments
- alert routing by severity/team/on-call target
- Front Door and edge telemetry
- Sentinel

## Next Monitoring Steps

The next best monitoring improvements are:

1. wire real receivers into the environment action groups
2. add synthetic availability tests for the public web endpoint
3. decide whether `prod` should get tighter alert thresholds and a dedicated
   action routing path
4. add a platform-level aggregate workbook once `qa`, `stg`, and `prod` are
   deployed

That keeps the current observability model grounded in Azure Monitor and easy to
operate while the landing zone is still growing.

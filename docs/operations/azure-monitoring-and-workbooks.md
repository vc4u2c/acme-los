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

The `/logging-demo` route follows that pattern:

- server render emits `logging.demo.server.render`
- traced flow emits a local browser console event as
  `logging.demo.client.browser`
- the browser posts allowlisted telemetry with the same trace id to the server
- the server writes paired container log events:
  `logging.demo.client.received` and `logging.demo.server.processed`
- standalone server action emits `logging.demo.server.manual`
- the page render, traced flow, and server-only action carry the same trace id
  for simple Log Analytics and Application Insights queries

The implementation uses the shared `@acme-los/core/logger` trace logger on the
server and a small browser trace logger helper under the web app. Keep future
client-to-server telemetry flows on that shape: typed event name, trace id,
allowlisted payload, server validation, then structured server log emission.

Do not use this path for arbitrary client blobs, cookies, bearer tokens, form
values, or customer PII.

### Future .NET Services

Future .NET services should keep the same operational contract:

- structured JSON logs to stdout/stderr for ACA console logs
- OpenTelemetry-compatible traces and logs for Application Insights
- stable, language-neutral event names and trace fields
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
  - `ContainerAppConsoleLogs` / `ContainerAppConsoleLogs_CL`
  - `ContainerAppSystemLogs` / `ContainerAppSystemLogs_CL`

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

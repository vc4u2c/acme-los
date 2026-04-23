# Azure And Website Demo Runbook

This runbook is the presenter-friendly walkthrough for showing the ACME LOS
`dev` environment in both Azure and the website.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure monitoring and workbooks](./azure-monitoring-and-workbooks.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Current platform architecture](../architecture/current-platform.md)
- [Auth and API contracts](../architecture/auth-and-api-contracts.md)

## Demo Story

The clean story to tell is:

1. we built a real landing-zone-shaped Azure foundation
2. the workload runs in `Azure Container Apps`
3. secrets and state are not kept in browser storage or in-process memory
4. `Key Vault` and `Redis` are private-only
5. monitoring, logs, alerts, and workbooks are already wired
6. the web app proves the platform behavior through live auth, session, and
   scale behavior

## Refresh Before The Demo

The `dev` ACA public hostname can change when the environment is rebuilt.

Run this before the demo if you want to confirm the current URL:

```powershell
$ingressFqdn = az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query 'properties.configuration.ingress.fqdn' `
  --output tsv

"https://$ingressFqdn"
```

Current known `dev` site:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`

Current health endpoint:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`

## Azure Portal Walkthrough

Use this order so the story feels intentional.

### 1. Governance And Subscription Shape

Start at management groups and subscriptions:

- tenant root
- `mg-acme`
- `mg-acme-platform`
- `mg-acme-landingzones`
- `mg-acme-online`
- `mg-acme-sandbox`

Then show the subscriptions:

- `sub-acme-platform`
- `sub-acme-nonprod-online`
- `sub-acme-prod-online`
- `sub-acme-sandbox`

Talking points:

- governance is persistent
- workloads can be created and destroyed without destroying the landing zone
- budgets are set per subscription

### 2. Platform Subscription

Go to `sub-acme-platform`.

Show:

- resource group `rg-acme-hub-network-cus-01`
- resource group `rg-acme-hub-monitor-cus-01`

In `rg-acme-hub-network-cus-01`, show:

- private DNS zone `privatelink.vaultcore.azure.net`
- private DNS zone `privatelink.redis.azure.net`

Talking points:

- shared DNS stays in the platform subscription
- workload VNets link into the shared platform DNS zones
- this is the platform/workload split, not one giant flat subscription

In `rg-acme-hub-monitor-cus-01`, show:

- Log Analytics workspace `log-acme-los-dev-cus-01`
- Application Insights resource `appi-acme-los-dev-cus-01`
- workbook `wbk-acme-los-ops-dev-cus-01`
- action group `ag-acme-los-ops-dev-cus-01`
- alert rules:
  - `alrt-acme-los-failed-requests-dev-cus-01`
  - `alrt-acme-los-exceptions-dev-cus-01`
  - `alrt-acme-los-auth-failures-dev-cus-01`
  - `alrt-acme-los-system-errors-dev-cus-01`

Talking points:

- monitoring ownership is platform-oriented
- the workload emits telemetry, but the ops plane is centralized
- alert receivers still need to be wired later

### 3. Workload Subscription

Go to `sub-acme-nonprod-online`, then resource group
`rg-acme-los-web-dev-cus-01`.

Show the workload resources:

- `cae-acme-los-dev-cus-01`
- `ca-acme-los-web-dev-cus-01`
- `vnet-acme-los-web-dev-cus-01`
- `kvacmelosdevcus01v42c`
- `redis-acme-los-dev-cus-01`
- `id-acme-los-web-dev-cus-01`
- `pep-acme-los-kv-dev-cus-01`
- `pep-acme-los-redis-dev-cus-01`
- `nic-acme-los-kv-dev-cus-01`
- `nic-acme-los-redis-dev-cus-01`

Talking points:

- workload compute, network, state, and private endpoints live with the workload
- shared DNS and shared ops live in platform
- this is the spoke pattern

### 4. VNet And Subnets

Open `vnet-acme-los-web-dev-cus-01`.

Show these subnets:

- app subnet:
  - `snet-acme-los-app-dev-cus-01`
- data subnet:
  - `snet-acme-los-data-dev-cus-01`

Talking points:

- ACA environment infrastructure uses the app subnet
- `Key Vault` and `Redis` private endpoints use the data subnet
- the naming is now semantic and easier to explain than service-shaped names

### 5. Container Apps

Open:

- `cae-acme-los-dev-cus-01`
- `ca-acme-los-web-dev-cus-01`

Show:

- ingress FQDN
- revision list
- replica count
- scale:
  - `minReplicas = 2`
  - `maxReplicas = 2`

Talking points:

- this is why we can demonstrate load-balanced requests across replicas
- the app is public for now
- later `Front Door` can be added in front and the ACA origin can be made private

### 6. Key Vault

Open `kvacmelosdevcus01v42c`.

Show:

- networking is private-only
- private endpoint exists
- secret references are consumed by ACA through managed identity

Talking points:

- secrets are not living in GitHub secrets as runtime configuration
- the app uses managed identity to read what it needs

Do not spend time showing raw secret values.

### 7. Managed Redis

Open `redis-acme-los-dev-cus-01`.

Show:

- networking/private endpoint
- metrics
- the resource is private-only

Talking points:

- session state is server-side
- it is no longer a per-instance in-memory store
- this is what allows auth/session continuity across multiple ACA replicas

### 8. Monitoring

Show three places:

1. `Application Insights`
   - `appi-acme-los-dev-cus-01`
2. `Log Analytics`
   - `log-acme-los-dev-cus-01`
3. Workbook
   - `wbk-acme-los-ops-dev-cus-01`

Best order:

1. workbook for the high-level view
2. App Insights for request/exception detail
3. Log Analytics for container/platform log detail

## Website Walkthrough

### 1. Landing Page

Open the `dev` site:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`

Show:

- environment label shows `dev`
- the experience looks like the real product, not a blank sample app

### 2. Start The Auth Flow

Click `Start application`.

Talking points:

- same Okta tenant is used for `local` and `dev`
- redirect URIs differ by environment
- auth is server-side, not a client-only token dance

### 3. Continue Into The Application Flow

Walk through:

- hosted sign-in
- callback back into the app
- arrival on `/apply/*`

Talking points:

- one main authenticated web session
- profile and apply routes share the same session boundary
- session is opaque and server-side
- `dev` uses a short 120 second idle window so the inactivity warning modal can be tested quickly

### 4. Validate Funding Step-Up MFA

Open:

- `/apply/funding`

What to prove:

- unauthenticated access redirects to
  `/account/sign-in?returnTo=%2Fapply%2Ffunding&aal=aal2`
- the funding sign-in start asks Okta for fresh MFA with `acr_values`,
  `prompt=login`, and `max_age=0`
- an existing `aal2` session is not enough by itself; the server session must
  also have the 10-minute funding step-up marker written by the latest Okta
  callback
- after the Okta challenge completes, the funding page and funding step APIs are
  allowed for that fresh funding window

Quick unauthenticated checks:

```powershell
$baseUrl = "https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io"

$fundingRoute = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "$baseUrl/apply/funding" `
  -MaximumRedirection 0 `
  -TimeoutSec 120

$fundingRoute.StatusCode
$fundingRoute.Headers.Location

$authStart = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "$baseUrl/api/auth/start?returnTo=%2Fapply%2Ffunding" `
  -MaximumRedirection 0 `
  -TimeoutSec 120

$authorizeUrl = [uri][string]$authStart.Headers.Location
$decodedAuthorizeQuery = [System.Net.WebUtility]::UrlDecode($authorizeUrl.Query)

$authorizeUrl.Host
$decodedAuthorizeQuery -match "acr_values=urn:okta:loa:2fa:any"
$decodedAuthorizeQuery -match "prompt=login"
$decodedAuthorizeQuery -match "max_age=0"
```

Expected result:

- route status is `307`
- route location includes `returnTo=%2Fapply%2Ffunding` and `aal=aal2`
- authorize host is `auth.avanai.net`
- all three Okta query checks return `True`

The final proof still needs an interactive browser session with a real dev Okta
user:

1. sign in normally
2. open `/apply/funding`
3. complete the fresh Okta prompt/MFA challenge
4. confirm the funding page loads and funding save/submit calls no longer return
   the step-up error during the 10-minute marker window

### 5. Show The Security Demo Page

Open:

- `/security`

This is only meant for `local` and `dev`.

Show:

- session cookie presence
- decoded token payload
- server-side session shape

Talking points:

- browser-visible token payload and server-side session are not the same thing
- some values can be session-backed even if they are not present in the raw JWT
- this helps explain the `leadId` / `customerId` distinction when needed

### 6. Show Health And Replica Distribution

Open the health endpoint repeatedly:

- `/api/health`

Current response includes:

- `environment`
- `build`
- `instanceId`
- `processId`
- `servedAt`

Talking points:

- requests are going through the ACA ingress/load-balancing layer
- the public app URL routes to different healthy replicas
- the `instanceId` proves that multiple ACA instances are serving traffic

### 7. Tie The Website Back To Redis

Explain this while signed in:

- the app is running on 2 replicas
- the session is still valid as requests hit different replicas
- that works because session state is in Redis, not instance memory

That is the cleanest way to demonstrate Redis sessions without turning the demo
into a low-level cache inspection exercise.

### 8. Show Client And Server Logging

Open:

- `/logging-demo`

Show:

- the per-action `traceparent` behavior
- the per-action `X-Correlation-ID` response/request header
- the full correlation id and trace id shown after each action
- `Run traced flow`
- `Emit API event`
- `Log client error`
- `Log server error`

Talking points:

- server-side code writes normal `info`, `warn`, and `error` events directly
  through the shared logger
- browser-origin operational events use `POST /api/observability/events` only
  when they need to be visible in Azure; product flows should send those events
  as best-effort background calls so user work does not wait on telemetry
- the traced flow first writes `logging.demo.client.browser` in the browser,
  then posts an allowlisted event to `POST /api/observability/events` with the
  W3C `traceparent` header
- the server writes `logging.demo.client.received` and
  `logging.demo.server.processed` into the container log stream for that same
  trace id
- the standalone `Emit API event` action proves the generic endpoint can
  validate a bounded event and write through the shared logger; it is not how
  ordinary server-side logs are emitted
- server logs keep the browser span as `parentSpanId`/`incomingTraceparent` and
  write the server span as `spanId`/`traceparent`, which is the shape future
  downstream .NET calls should continue through OpenTelemetry propagation
- the error buttons use controlled throw/catch paths so the demo can show
  client-origin and server-origin errors without crashing the page
- `traceparent` is the standard propagation header; `X-TraceId` is a common
  custom or legacy convention but is not the standard tracing header
- `X-Correlation-ID` is carried as a separate app/business correlation header
  and echoed back after server validation
- every server-side log includes runtime fields such as `environment`,
  `service`, `version`, and `build`, so local, dev, and future higher
  environments remain easy to separate
- logging emission is non-blocking; the app does not wait on a logging transport
  to keep serving the request
- the full correlation id from the UI is the easiest value to paste into both
  App Insights and Container Apps log queries for one button click

## Monitoring Demo

### Workbook

Best things to show in the workbook:

- request volume
- failed requests
- exception count
- p95 latency
- dependency health
- warning/error logs
- ACA platform/system log sections

Talking point:

- this is the Azure-native ops view for support teams

### Application Insights

Best things to show:

- failed requests
- exceptions
- end-to-end request traces
- dependency calls

Example Kusto queries:

Copy and run one Kusto block at a time. If the portal reports a token like
`asclet`, the previous query's `asc` and the next query's `let` were pasted
together without clearing the query window or preserving a separator.

Run the `AppTraces` queries from `log-acme-los-dev-cus-01` or
`appi-acme-los-dev-cus-01`. If `AppTraces` does not resolve, the Logs blade is
scoped to the wrong resource.

```kusto
AppRequests
| where TimeGenerated > ago(30m)
| summarize Requests=count(), Failures=countif(Success == false), P95=percentile(DurationMs, 95);
```

```kusto
AppExceptions
| where TimeGenerated > ago(30m)
| project TimeGenerated, ProblemId, ExceptionType, Message
| order by TimeGenerated desc;
```

```kusto
AppTraces
| where TimeGenerated > ago(30m)
| where SeverityLevel >= 2
| project TimeGenerated, SeverityLevel, Message
| order by TimeGenerated desc;
```

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
AppTraces
| where TimeGenerated > ago(30m)
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

### Log Analytics

Best things to show:

- ACA console warnings/errors
- ACA platform/system events
- logging demo traced browser-to-server and API-handled events

Example queries:

Copy and run one Kusto block at a time.

Run these Container Apps log queries from the `log-acme-los-dev-cus-01` Log
Analytics workspace. Current `dev` raw ACA logs use the `_CL` table names.

```kusto
let containerAppName = 'ca-acme-los-web-dev-cus-01';
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30m)
| extend
    ContainerApp = tostring(ContainerAppName_s),
    RevisionName = tostring(RevisionName_s),
    LogMessage = tostring(Log_s)
| where ContainerApp =~ containerAppName
| where LogMessage has_any ("error", "warn", "fail")
| project TimeGenerated, RevisionName, LogMessage
| order by TimeGenerated desc;
```

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
let containerAppName = 'ca-acme-los-web-dev-cus-01';
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30m)
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
    level = tostring(payload.level),
    message = tostring(payload.message),
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
    level,
    message,
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

```kusto
ContainerAppSystemLogs_CL
| where TimeGenerated > ago(30m)
| extend
    Reason = tostring(Reason_s),
    LogMessage = tostring(Log_s)
| project TimeGenerated, Reason, LogMessage
| order by TimeGenerated desc;
```

## Redis Session Demo

What to say:

- the session store is centralized and server-side
- two ACA replicas are live
- repeated requests hit both replicas
- the signed-in journey stays intact because session state is in Redis

What to show in Azure:

- `redis-acme-los-dev-cus-01`
- private endpoint `pep-acme-los-redis-dev-cus-01`
- NIC `nic-acme-los-redis-dev-cus-01`
- the resource is private-only

What to show in the website:

- sign in once
- browse a guarded route
- hit `/api/health` several times
- point out the changing `instanceId`
- explain that the session survives across those replicas

Command checks:

Use these only when you want to prove the backing state path. The normal demo
should still lead with the website and `/api/health` replica behavior.

Local Redis is a Docker Compose container with normal `redis-cli` access:

```powershell
npx.cmd nx run web-app:redis-up
npx.cmd nx run web-app:dev-redis
```

In another terminal:

```powershell
docker exec -it acme-los-redis redis-cli PING
docker exec -it acme-los-redis redis-cli INFO keyspace
docker exec -it acme-los-redis redis-cli --scan --pattern 'acme-los:web:*'
docker exec -it acme-los-redis redis-cli TYPE '<redis-key-from-scan>'
docker exec -it acme-los-redis redis-cli TTL '<redis-key-from-scan>'
```

Useful local key patterns:

- `acme-los:web:auth-session:*`
- `acme-los:web:application-flow:*`
- `acme-los:web:customer-profile:*`
- `acme-los:web:rate-limit:*`

Do not print live `auth-session` or `customer-profile` values during a shared
demo. Those records can include tokens or customer-entered details. `SCAN`,
`TYPE`, and `TTL` are enough to prove the state exists and expires.

Stop local Redis when done:

```powershell
npx.cmd nx run web-app:redis-down
```

`dev` Redis is different from local Redis:

- `redis-acme-los-dev-cus-01` is private-only through the private endpoint
  `pep-acme-los-redis-dev-cus-01`
- Redis access-key authentication is disabled for Azure
- the web app uses Microsoft Entra auth from the ACA user-assigned managed
  identity
- Redis data-plane checks must run from a private-network context, such as the
  running ACA container or a purpose-built diagnostic container/job in the
  workload VNet

For the running `dev` app, exec into the ACA web container:

```powershell
az containerapp exec `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --container web `
  --command "/bin/sh"
```

Inside the container, first confirm the Redis runtime settings:

```sh
node -e "for (const name of ['ACME_WEB_STATE_STORE','ACME_REDIS_AUTH_MODE','ACME_REDIS_HOST','ACME_REDIS_PORT','ACME_REDIS_KEY_PREFIX','ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID','AZURE_CLIENT_ID']) console.log(name + '=' + (process.env[name] || ''))"
```

Then prove private DNS and private endpoint reachability:

```sh
node -e "const dns = require('node:dns'); dns.lookup(process.env.ACME_REDIS_HOST, (error, address) => { if (error) throw error; console.log(address); })"
node -e "const net = require('node:net'); const socket = net.createConnection({ host: process.env.ACME_REDIS_HOST, port: Number(process.env.ACME_REDIS_PORT || 10000) }, () => { console.log('connected to Redis private endpoint'); socket.end(); }); socket.setTimeout(5000, () => { console.error('timeout'); socket.destroy(); process.exit(1); }); socket.on('error', (error) => { console.error(error.message); process.exit(1); });"
```

The production web image does not rely on `redis-cli`. Use the same Node Redis
client and Entra auth path as the app for a safe `PING`, key scan, type, and TTL
check:

```sh
node <<'NODE'
const { DefaultAzureCredential } = require('@azure/identity');
const { createClient } = require('@redis/client');
const {
  EntraIdCredentialsProviderFactory,
  REDIS_SCOPE_DEFAULT,
} = require('@redis/entraid');

const managedIdentityClientId =
  process.env.ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID || process.env.AZURE_CLIENT_ID;
const credential = new DefaultAzureCredential(
  managedIdentityClientId
    ? {
        managedIdentityClientId,
        workloadIdentityClientId: managedIdentityClientId,
      }
    : undefined,
);
const client = createClient({
  url: `rediss://${process.env.ACME_REDIS_HOST}:${
    process.env.ACME_REDIS_PORT || 10000
  }`,
  credentialsProvider:
    EntraIdCredentialsProviderFactory.createForDefaultAzureCredential({
      credential,
      scopes: REDIS_SCOPE_DEFAULT,
      tokenManagerConfig: {
        expirationRefreshRatio: 0.8,
      },
    }),
});

client.on('error', (error) => console.error(error));

(async () => {
  await client.connect();
  console.log(await client.ping());

  const prefix = process.env.ACME_REDIS_KEY_PREFIX || 'acme-los:web';
  const keys = [];

  for await (const keyBatch of client.scanIterator({
    MATCH: `${prefix}:*`,
    COUNT: 25,
  })) {
    for (const key of keyBatch) {
      keys.push(key);

      if (keys.length >= 20) {
        break;
      }
    }

    if (keys.length >= 20) {
      break;
    }
  }

  console.log(keys.length ? keys.join('\n') : '(no keys)');

  if (keys[0]) {
    console.log(`${keys[0]} type=${await client.type(keys[0])} ttl=${await client.ttl(keys[0])}`);
  }

  await client.quit();
})().catch(async (error) => {
  console.error(error);

  try {
    await client.quit();
  } finally {
    process.exit(1);
  }
});
NODE
```

## Presenter Notes

- do not spend time reading raw secrets in Key Vault
- do not spend time on generated ACA infrastructure internals
- keep the story on platform boundaries, runtime behavior, and operations
- if asked about NSGs:
  - they are already used to make the app-subnet and data-subnet boundary explicit
  - they do not replace the later Front Door, WAF, and private-origin hardening
- if asked whether replicas are directly reachable:
  - no, traffic goes through ACA ingress/load balancing

## Quick Demo Links

- website:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`
- health:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`
- security demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/security`
- funding MFA validation:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/apply/funding`
- logging demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/logging-demo`

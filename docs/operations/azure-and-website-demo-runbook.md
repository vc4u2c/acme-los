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
- `log-acme-los-dev-cus-01`
- `appi-acme-los-dev-cus-01`
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

### 4. Show The Security Demo Page

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

### 5. Show Health And Replica Distribution

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

### 6. Tie The Website Back To Redis

Explain this while signed in:

- the app is running on 2 replicas
- the session is still valid as requests hit different replicas
- that works because session state is in Redis, not instance memory

That is the cleanest way to demonstrate Redis sessions without turning the demo
into a low-level cache inspection exercise.

### 7. Show Client And Server Logging

Open:

- `/logging-demo`

Show:

- the server-rendered trace id
- `Run traced flow`
- `Emit server-only log`

Talking points:

- server events are written by the Next.js runtime through the shared logger
- the traced flow first writes `logging.demo.client.browser` in the browser,
  then posts allowlisted telemetry to the server
- the server writes `logging.demo.client.received` and
  `logging.demo.server.processed` into the container log stream for that same
  trace id
- the trace id lets the audience follow the same demo event across App
  Insights traces and raw Container Apps console logs

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

```kusto
AppRequests
| where TimeGenerated > ago(30m)
| summarize Requests=count(), Failures=countif(Success == false), P95=percentile(DurationMs, 95)
```

```kusto
AppExceptions
| where TimeGenerated > ago(30m)
| project TimeGenerated, ProblemId, ExceptionType, Message
| order by TimeGenerated desc
```

```kusto
AppTraces
| where TimeGenerated > ago(30m)
| where SeverityLevel >= 2
| project TimeGenerated, SeverityLevel, Message
| order by TimeGenerated desc
```

```kusto
AppTraces
| where TimeGenerated > ago(30m)
| where Message has "logging demo"
   or tostring(Properties.event) startswith "logging.demo"
| project TimeGenerated, SeverityLevel, Message, Properties
| order by TimeGenerated desc
```

### Log Analytics

Best things to show:

- ACA console warnings/errors
- ACA platform/system events
- logging demo traced browser-to-server and server-only events

Example queries:

```kusto
ContainerAppConsoleLogs
| where TimeGenerated > ago(30m)
| where ContainerAppName == "ca-acme-los-web-dev-cus-01"
| where Log_s has_any ("error", "warn", "fail")
| project TimeGenerated, RevisionName_s, Log_s
| order by TimeGenerated desc
```

```kusto
ContainerAppConsoleLogs
| where TimeGenerated > ago(30m)
| where ContainerAppName == "ca-acme-los-web-dev-cus-01"
| where Log_s has "logging.demo"
| project TimeGenerated, RevisionName_s, Log_s
| order by TimeGenerated desc
```

```kusto
ContainerAppSystemLogs
| where TimeGenerated > ago(30m)
| project TimeGenerated, Reason_s, Log_s
| order by TimeGenerated desc
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

## Presenter Notes

- do not spend time reading raw secrets in Key Vault
- do not spend time on generated ACA infrastructure internals
- keep the story on platform boundaries, runtime behavior, and operations
- if asked about NSGs:
  - not needed yet for this current public ACA `dev` path
  - more important when we move to `Front Door` and a private ACA origin
- if asked whether replicas are directly reachable:
  - no, traffic goes through ACA ingress/load balancing

## Quick Demo Links

- website:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`
- health:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`
- security demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/security`
- logging demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/logging-demo`

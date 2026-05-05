# Azure Bootstrap And Teardown

This doc is the practical command path for the current Azure scaffold.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure governance and lifecycle](./azure-governance-and-lifecycle.md)
- [Azure monitoring and workbooks](./azure-monitoring-and-workbooks.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Azure infrastructure scaffold](../../infra/azure/README.md)

## Prerequisites

- Azure CLI authenticated
- GitHub CLI authenticated
- repository checked out locally
- PowerShell available

Optional later:

- additional subscriptions created and placed into the landing-zone hierarchy

## Set The Cost Guardrail First

Create or update the monthly subscription budget before you bootstrap anything
else:

```powershell
npm run azure:budget
```

Current default behavior:

- applies the configured monthly budgets across the target subscriptions
- current split:
  - `platform` `$10`
  - `nonprod-online` `$20`
  - `prod-online` `$15`
  - `sandbox` `$5`
- emails the signed-in user when possible
- sends notifications at `50%`, `80%`, `100%`, and `100% forecast`

Budget defaults live in:

- [governance.json](../../infra/azure/config/governance.json)

## Bootstrap Tenant Governance

Show the tenant-governance plan first:

```powershell
npm run azure:show-governance
```

Apply the management-group hierarchy and move the current subscription into the
target workload group:

```powershell
npm run azure:bootstrap:governance
```

Current governance bootstrap scope:

- ensure the target management-group hierarchy exists
- place subscriptions under the target management groups
- keep the management-group hierarchy and subscription layout aligned to the
  target landing-zone model

## Deploy The Platform Network Foundation

Deploy the persistent platform network layer before the first workload:

```powershell
npm run azure:deploy:platform-network
```

Current platform network scope:

- `rg-acme-hub-network-cus-01`
- shared private DNS zones for:
  - `privatelink.vaultcore.azure.net`
  - `privatelink.redis.azure.net`

These are persistent platform resources. Workload environments should attach to
them, not recreate them.

## Bootstrap The GitHub And Azure Automation Contract

Show the resolved plan first:

```powershell
npm run azure:show-plan
```

Bootstrap or refresh the GitHub environment contract:

```powershell
npm run azure:bootstrap
```

Refresh variables and environment metadata without recreating identities:

```powershell
npm run azure:sync-environments
```

Current bootstrap scope:

- GitHub environments
- repo variables
- environment variables
- Entra app registrations / service principals for deployment
- GitHub OIDC federated credentials
- scoped platform-network access for deployment identities so they can manage
  environment-specific private DNS links

Current bootstrap non-scope:

- management groups
- subscriptions
- shared hub resources
- application runtime secrets

## Deploy The First Web Environment

Deploy `dev`:

```powershell
npm run azure:deploy:platform-network
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

Deploy `qa`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName qa
```

The deploy script is idempotent:

- it creates or updates a subscription-scope deployment stack for the workload resource group
- then creates or updates a resource-group-scope deployment stack for the web infrastructure
- then creates or updates the ACA runtime deployment for the container app revision
- then creates or updates the environment monitoring stack in the platform monitor RG:
  - workbook
  - action group
  - log alerts
- then syncs the workbook definition so the live workbook content stays aligned to the repo template
- it skips the ACR rebuild if the requested image tag already exists

If you need to force a new container image after runtime or Docker changes, pass
an explicit tag:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -ImageTag aca-fix-20260407-telemetry
```

Azure deploys use the Redis-backed state path by default. Use the file-backed
override only for targeted debugging when you are not validating multi-replica
session behavior:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -StateStoreMode file
```

## Pause And Resume A Non-Production Workload

Show the current workload state and the alert resources the script would manage:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action show-plan
```

Pause `dev`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action pause
```

Resume `dev`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action resume
```

Pause and resume behavior:

- uses the official ACA ARM `stop` and `start` actions for the container app
- optionally disables scheduled-query alerts before pause and re-enables them after resume
- waits for `Stopped` or `Running` by default so the command behaves predictably in automation
- blocks `prod` pause unless `-AllowProductionPause` is passed explicitly

Important cost note:

- pause and resume only affect the ACA web workload and its environment-specific alerts
- they do not deallocate:
  - Azure Managed Redis
  - Key Vault
  - ACR
  - the ACA environment
  - platform monitoring resources
- if you want the lowest non-production cost, use teardown instead of pause

Current infrastructure scope:

- platform DNS link stack in `rg-acme-hub-network-cus-01`
- platform monitoring stack in `rg-acme-hub-monitor-cus-01`
  - `Log Analytics`
  - `Application Insights`
  - workbook
  - action group
  - log alerts
- resource group
- shared images resource group per subscription role
- workload spoke VNet
- app subnet for the ACA environment
- data subnet for private endpoints
- Azure Container Registry
- Azure Container Apps environment
- container app
- user-assigned managed identity
- Key Vault
- Azure Managed Redis
- Key Vault private endpoint
- Key Vault private-endpoint NIC
- Azure Managed Redis private endpoint
- Azure Managed Redis private-endpoint NIC

Current runtime secret wiring:

- the container app reads the web session secret through a Key Vault secret reference
- the container app uses managed identity for Key Vault access, ACR pulls, and Redis token acquisition
- Azure Redis access-key authentication is disabled; no Azure Redis URL secret is created
- the container app stays public for now so the workload can be validated before
  Front Door is introduced

Current proven state:

- the `dev` environment is deployed in `sub-acme-nonprod-online`
- the web workload is running in `Azure Container Apps`
- `Key Vault` and `Azure Managed Redis` are private-only
- Redis managed-identity auth is proven live in `dev` as of April 19, 2026
- the ACA ingress is public for now
- the public endpoint is discovered from the current ACA deployment output
- use `/api/health` on that resolved base URL for public smoke checks
- ACA probes use `/api/health/live`, which stays local to the Next web
  container

Practical smoke-check path after a deploy:

```powershell
az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query "{runningStatus:properties.runningStatus,latestReadyRevisionName:properties.latestReadyRevisionName,ingressFqdn:properties.configuration.ingress.fqdn}" `
  --output json

$ingressFqdn = az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query 'properties.configuration.ingress.fqdn' `
  --output tsv

(Invoke-WebRequest -UseBasicParsing -Uri "https://$ingressFqdn/api/health" -TimeoutSec 120).Content
```

Current observability wiring:

- the container app receives an `APPLICATIONINSIGHTS_CONNECTION_STRING`
- the Node runtime starts Azure Monitor OpenTelemetry before the standalone
  Next server boots
- `Application Insights` receives traces, exceptions, and metrics
- the shared server logger also emits application log records into
  `Application Insights`
- `Log Analytics` receives container stdout/stderr and ACA platform logs
- `/api/health` and `/api/health/live` are filtered from App Insights so health
  traffic does not dominate telemetry volume
- trace sampling is rate-limited by environment:
  - `dev`, `qa`, `stg`: `2` traces per second
  - `prod`: `5` traces per second

Current monitoring deployment for each environment:

- Azure Monitor workbook
- action group
- scheduled query alerts for:
  - failed request spikes
  - exception spikes
  - auth and security failure spikes
  - ACA platform/system errors

Current follow-up note:

- the action group is deployed now
- receiver routing still needs to be added deliberately
- until then, alerts are visible in Azure Monitor but are not yet a paging path

## Tear Down A Non-Production Environment

Teardown `dev` and wait for completion:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName dev -WaitForDeletion
```

Teardown `qa`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName qa -WaitForDeletion
```

Teardown behavior:

- delete the platform DNS link stack for the environment
- delete the platform monitoring stack for the environment
- delete the resource-group-scope deployment stack
- delete the subscription-scope deployment stack
- wait for deletion when requested
- purge the matching deleted Key Vault if Azure has soft-deleted it

This keeps non-production cost under control while preserving the governance
structure.

Production teardown exists but is intentionally guarded:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName prod -WaitForDeletion -AllowProductionTeardown
```

That path should only be used deliberately and never as part of normal
operations.

## Cost Discipline

For a pay-as-you-go subscription, the intended daily rhythm is:

1. keep the subscription budget in place
2. keep governance and identity structure persistent
3. deploy workload resources only when needed
4. validate the environment
5. tear down non-production workloads quickly

Do not tear down:

- subscription budgets
- management groups
- subscriptions
- GitHub environments
- deployment identities

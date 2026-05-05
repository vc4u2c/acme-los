# Azure Infrastructure

This folder is the starting point for the Azure landing-zone and workload
deployment path for ACME LOS.

It is intentionally split into two layers:

- `config`
  - shared naming, environment, and subscription-shape metadata
- `bicep`
  - Azure infrastructure entrypoints and reusable modules

This is the live Azure implementation surface for the repo, not a portal-only
notes file. The platform is still growing, but `dev` is a proven ACA workload
path now.

Current proven state:

- the landing-zone governance hierarchy exists
- the target `platform`, `nonprod`, `prod`, and `sandbox` subscriptions exist
- the persistent platform network foundation is deployed
- `dev` is deployed to `Azure Container Apps` in `sub-acme-nonprod-online`
- `Key Vault` and `Azure Managed Redis` are private-only
- subnet-level NSGs are now part of the workload network posture
- ACA stays public for now until Front Door is introduced later
- `dev` now has a first Azure-native operations pack:
  - workbook
  - action group
  - log alerts

What is here now:

- `config/platform.json`
  - repository-wide Azure and environment metadata
- `config/governance.json`
  - management-group, subscription, Entra group, and RBAC source of truth
- `bicep/main.hub.sub.bicep`
  - lightweight shared hub resource-group scaffold
- `bicep/main.workload.sub.bicep`
  - subscription-scope workload resource-group scaffold
- `bicep/main.web.rg.bicep`
  - first web workload resource-group entrypoint
- `bicep/main.web.runtime.rg.bicep`
  - container app runtime revision entrypoint
- `bicep/main.web.monitoring.rg.bicep`
  - platform-owned Log Analytics, Application Insights, workbook, action group,
    and alert entrypoint
- `bicep/main.images.sub.bicep` and `bicep/main.images.rg.bicep`
  - shared ACR and image-resource-group entrypoints by subscription role
- `bicep/*.bicepparam`
  - environment-specific parameter files for `dev`, `qa`, `stg`, and `prod`
- `bicep/modules/*`
  - reusable naming, tagging, monitoring, state, web, and security modules

What is intentionally not here yet:

- Front Door
- WAF
- ADE
- Sentinel

Those come later, after the base workload path is proven.

Current best next steps:

1. keep `dev` aligned through main CI/CD
2. prove `qa` with the same stack-backed deployment path
3. wire notification receivers into the action groups
4. add Front Door and WAF after non-production deployments are repeatable

Generated Bicep build artifacts under `infra/azure/bicep/*.json` are local
validation output and should not be committed.

## Bootstrap Scripts

Use the repo scripts in this order:

```powershell
npm run azure:budget
npm run azure:show-governance
npm run azure:bootstrap:governance
npm run azure:deploy:platform-network
npm run azure:show-plan
npm run azure:bootstrap
npm run azure:sync-environments
```

Scripts:

- [ensure-subscription-budget.ps1](../../tools/scripts/azure/ensure-subscription-budget.ps1)
- [bootstrap-governance.ps1](../../tools/scripts/azure/bootstrap-governance.ps1)
- [setup-github-azure-environments.ps1](../../tools/scripts/azure/setup-github-azure-environments.ps1)
- [deploy-web-environment.ps1](../../tools/scripts/azure/deploy-web-environment.ps1)
- [set-web-environment-state.ps1](../../tools/scripts/azure/set-web-environment-state.ps1)
- [teardown-web-environment.ps1](../../tools/scripts/azure/teardown-web-environment.ps1)

The script reads:

- [platform.json](./config/platform.json)

Supporting governance source of truth:

- [governance.json](./config/governance.json)

And they currently handle:

- subscription budget guardrail
- management-group hierarchy bootstrap
- configured subscription placement under the target management groups
- GitHub environment creation
- repository variable sync
- environment variable sync
- Azure app-registration creation for deployment identities
- GitHub OIDC federated credentials
- subscription-scope `Contributor` role assignment for each environment identity
- subscription-scope `User Access Administrator` role assignment for each environment identity
- platform-network `Contributor` role assignment for each environment identity on `rg-acme-hub-network-cus-01`
- alert-aware pause and resume command paths for the ACA web workload
- local deploy and teardown command paths for non-production workloads

Current lifecycle model:

- subscription-scope deployment stack for the workload resource group
- resource-group-scope deployment stack for the web infrastructure
- explicit production teardown warning path instead of silent destructive defaults

## First Deployment Order

1. Set the subscription budget guardrail.
2. Bootstrap the management-group hierarchy.
3. Deploy the persistent platform network foundation.
4. Review the created GitHub variables and environment variables.
5. Deploy the subscription-scope workload scaffold.
6. Deploy the resource-group-scope web workload and platform DNS links.
7. Validate the deployed web app in `dev`.
8. Add teardown before widening the footprint.

Current command path:

```powershell
npm run azure:budget
npm run azure:show-governance
npm run azure:bootstrap:governance
npm run azure:deploy:platform-network
npm run azure:show-plan
npm run azure:bootstrap
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action show-plan
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action pause
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action resume
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName dev -WaitForDeletion
```

The web deployment path is now proven end to end for `dev`.

Current public health check:

```powershell
$ingressFqdn = az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query 'properties.configuration.ingress.fqdn' `
  --output tsv

(Invoke-WebRequest -UseBasicParsing -Uri "https://$ingressFqdn/api/health" -TimeoutSec 120).Content
```

ACA startup, readiness, and liveness probes use `/api/health/live`, which stays
local to the Next web container. `/api/health` remains the public smoke path and
proxies to the BFF when the BFF is enabled for the environment.

If the runtime image changes and you want to force a new image build instead of
reusing an existing tag, pass `-ImageTag` explicitly:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -ImageTag aca-fix-20260407-telemetry
```

Azure deploys use the Redis-backed state path by default. Use the file-backed
override only for targeted debugging when you are not validating multi-replica
session behavior:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -StateStoreMode file
```

## Cost-Conscious Default

The first web workload scaffold currently deploys:

- persistent platform network resources:
  - shared private DNS zone for Key Vault
  - shared private DNS zone for Azure Managed Redis
- persistent platform monitoring resources in `rg-acme-hub-monitor-cus-01`:
  - environment-scoped `Log Analytics`
  - workspace-based `Application Insights`
  - workbook
  - action group
  - log alerts
- `Azure Container Apps`
- workload spoke VNet
- app subnet for the ACA environment
- data subnet for Key Vault and Redis private endpoints
- app-subnet NSG that blocks data-subnet initiated traffic into the ACA subnet
- data-subnet NSG that only allows app-subnet traffic to the private endpoint ports needed today:
  - `443` for Key Vault
  - `10000` for Azure Managed Redis
- shared `Azure Container Registry` per subscription role
- `user-assigned managed identity` for the web runtime
- `Key Vault`
- `Azure Managed Redis`
- Key Vault private endpoint in the data/private-endpoint subnet
- Key Vault private-endpoint NIC with deterministic naming
- Azure Managed Redis private endpoint in the data/private-endpoint subnet
- Azure Managed Redis private-endpoint NIC with deterministic naming
- environment-specific platform DNS links

Runtime secret handling:

- Azure Redis access uses Microsoft Entra auth through the container app's user-assigned managed identity
- the Redis access policy assignment is deployed with Bicep against the Redis database
- Redis access-key authentication is disabled on the Azure Managed Redis database
- the Redis connection URL path is retained only for local Docker Redis
- the container app uses its user-assigned managed identity for Key Vault access and Redis token acquisition
- the container app also uses managed identity for `AcrPull`

Runtime session behavior:

- authenticated web sessions are enforced server-side with both absolute and idle expiry
- `sessionIdleTimeoutSeconds` and `sessionWarningSeconds` are Bicep runtime parameters that become `ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS` and `ACME_WEB_SESSION_WARNING_SECONDS` in the container app
- `dev` defaults to a 120 second idle timeout and 30 second warning so the inactivity modal is easy to test
- `qa`, `stg`, and `prod` deploy a 15 minute idle timeout with a 2 minute warning
- the browser modal calls the CSRF-protected session touch route only after real user activity or an explicit stay-signed-in action

Runtime telemetry:

- the Node server is preloaded with the Azure Monitor OpenTelemetry distro before
  the standalone Next server starts
- `Application Insights` receives traces, exceptions, and metrics
- `ACA` container stdout and stderr stay available through `Log Analytics`
- `/api/health` and `/api/health/live` requests are filtered out of App
  Insights to keep low-value health traffic and ingestion cost down
- OpenTelemetry sampling is rate-limited by environment:
  - `dev`, `qa`, `stg`: `2` traces/second
  - `prod`: `5` traces/second
- the shared server logger emits to both:
  - structured container stdout/stderr
  - the OpenTelemetry logs API, so app logs also land in Application Insights
- per-environment monitoring resources are created through a platform-owned stack during the web deploy and the workbook content is synced after deployment:
  - workbook
  - action group
  - log alerts for failed requests, exceptions, auth failures, and ACA platform errors

Operations dashboard details live in:

- [Azure monitoring and workbooks](../../docs/operations/azure-monitoring-and-workbooks.md)

Current implementation note:

- Azure Managed Redis supports Microsoft Entra authentication and Microsoft recommends it
- the current Azure path uses Redis Entra auth from the ACA user-assigned managed identity
- the `dev` Redis managed-identity path was live-verified on April 19, 2026
- Redis access keys are disabled in source so Azure deployments do not depend on a Key Vault Redis URL secret
- ACA stays publicly reachable for now
- Key Vault and Azure Managed Redis are private-only
- subnet-to-subnet policy is enforced with NSGs, but that does not replace later Front Door and WAF edge hardening
- Front Door and a private ACA origin come later once the public workload path is proven

Pause and resume note:

- `set-web-environment-state.ps1` uses the official ACA ARM `start` and `stop`
  actions for the container app
- when alert suppression is enabled, it also disables or re-enables the
  environment's scheduled-query alerts in `rg-acme-hub-monitor-cus-01`
- this helps avoid alert noise during intentional non-production downtime
- pause and resume reduce web compute spend, but they do not deallocate:
  - Azure Managed Redis
  - Key Vault
  - ACR
  - the ACA environment
  - monitoring resources
- for the deepest savings, use teardown instead of pause

Portability rule:

- GitHub Actions is the current orchestrator
- the actual Azure deployment logic lives in `Bicep` and `tools/scripts/azure/*`
- keep that boundary clean so the same deploy path can be called from Azure DevOps later

That keeps the first Azure pass cleaner while preserving the shape needed for
Front Door, private networking, and stricter hardening later. Use the teardown
script aggressively to keep Redis spend under control in non-production.

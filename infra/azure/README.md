# Azure Infrastructure

This folder is the starting point for the Azure landing-zone and workload
deployment path for ACME LOS.

It is intentionally split into two layers:

- `config`
  - shared naming, environment, and subscription-shape metadata
- `bicep`
  - Azure infrastructure entrypoints and reusable modules

This is the first scaffolding slice, not the finished platform.

Current proven state:

- the landing-zone governance hierarchy exists
- the target `platform`, `nonprod`, `prod`, and `sandbox` subscriptions exist
- the persistent platform network foundation is deployed
- `dev` is deployed to `Azure Container Apps` in `sub-acme-nonprod-online`
- `Key Vault` and `Azure Managed Redis` are private-only
- ACA stays public for now until Front Door is introduced later

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
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName dev -WaitForDeletion
```

The web deployment path is now proven end to end for `dev`.

Current public health check:

```powershell
(Invoke-WebRequest -UseBasicParsing -Uri 'https://ca-acme-los-web-dev-cus-01.icyrock-b2ec4b26.centralus.azurecontainerapps.io/api/health' -TimeoutSec 120).Content
```

If the runtime image changes and you want to force a new image build instead of
reusing an existing tag, pass `-ImageTag` explicitly:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -ImageTag aca-fix-20260407-telemetry
```

Optional deploy override:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -StateStoreMode redis
```

## Cost-Conscious Default

The first web workload scaffold currently deploys:

- persistent platform network resources:
  - shared private DNS zone for Key Vault
  - shared private DNS zone for Azure Managed Redis
- `Azure Container Apps`
- workload spoke VNet
- ACA infrastructure subnet
- private endpoint subnet
- shared `Azure Container Registry` per subscription role
- `user-assigned managed identity` for the web runtime
- workspace-based `Application Insights`
- `Log Analytics`
- `Key Vault`
- `Azure Managed Redis`
- Key Vault private endpoint
- Azure Managed Redis private endpoint
- environment-specific platform DNS links

Runtime secret handling:

- the Redis connection URL is stored in the environment Key Vault
- the container app reads it through a Key Vault secret reference
- the container app uses its user-assigned managed identity for Key Vault access
- the container app also uses managed identity for `AcrPull`

Runtime telemetry:

- the Node server is preloaded with the Azure Monitor OpenTelemetry distro before
  the standalone Next server starts
- `Application Insights` receives traces, exceptions, and metrics
- `ACA` container stdout and stderr stay available through `Log Analytics`
- `/api/health` requests are filtered out of App Insights to keep low-value probe
  noise and ingestion cost down
- OpenTelemetry sampling is rate-limited by environment:
  - `dev`, `qa`, `stg`: `2` traces/second
  - `prod`: `5` traces/second

Current implementation note:

- Azure Managed Redis supports Microsoft Entra authentication and Microsoft recommends it
- the current app runtime still uses a Redis URL, so this first slice uses Redis access keys stored in Key Vault instead of baking secrets into GitHub or plain app settings
- ACA stays publicly reachable for now
- Key Vault and Azure Managed Redis are private-only
- Front Door and a private ACA origin come later once the public workload path is proven

Portability rule:

- GitHub Actions is the current orchestrator
- the actual Azure deployment logic lives in `Bicep` and `tools/scripts/azure/*`
- keep that boundary clean so the same deploy path can be called from Azure DevOps later

That keeps the first Azure pass cleaner while preserving the shape needed for
Front Door, private networking, and stricter hardening later. Use the teardown
script aggressively to keep Redis spend under control in non-production.

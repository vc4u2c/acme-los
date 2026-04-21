---
name: azure-landing-zone-and-aca
description: Azure landing zone, subscription governance, Bicep, Deployment Stacks, ACA, platform monitoring, private endpoints, and workload networking guidance for the acme-los repo. Use when changing Azure IaC, GitHub-to-Azure deployment automation, Azure monitoring/workbooks, ACA runtime settings, platform vs workload resource placement, or teardown/bootstrap behavior.
origin: ACME LOS
---

# Azure Landing Zone And ACA

Use this skill for Azure work in `acme-los` where the repo and live platform shape matter more than generic Azure advice.

## Follow These Rules

- Keep `acme` as the company/platform token and `los` as the workload token.
- Prefer Bicep, PowerShell, Deployment Stacks, and workflow changes over portal-only edits.
- Treat `main` plus the real deployed `dev` state as the source of truth that docs must match.
- Keep platform resources in `sub-acme-platform` and workload runtime resources in the workload subscriptions unless there is a clear exception.
- Preserve idempotency in scripts and explicit teardown behavior for non-prod.

## Current Platform Shape

- `dev` runs on Azure Container Apps.
- Redis and Key Vault are private-only through private endpoints.
- Monitoring is platform-owned.
- Deployment uses Azure Deployment Stacks plus PowerShell orchestration.
- GitHub deploy identities use OIDC.

## Read These Files First

- `infra/azure/README.md`
- `docs/operations/azure-platform-plan.md`
- `docs/operations/azure-bootstrap-and-teardown.md`
- `docs/operations/azure-monitoring-and-workbooks.md`
- `docs/operations/github-azure-environments.md`
- `infra/azure/config/governance.json`
- `infra/azure/config/platform.json`
- `tools/scripts/azure/deploy-web-environment.ps1`
- `tools/scripts/azure/setup-github-azure-environments.ps1`

## Working Pattern

1. Confirm whether the change belongs in platform, workload, or app runtime.
2. Inspect the matching Bicep entrypoint and PowerShell orchestration script together.
3. Preserve naming, tags, and environment conventions already defined in the repo.
4. Prefer the smallest reversible IaC/script change that keeps `dev`, `qa`, `stg`, and `prod` scalable.
5. If you patch live Azure to debug, fold that behavior back into source quickly.

## Specific Guidance

### Platform vs Workload

- Platform subscription owns shared monitor/workbook/action-group resources and other shared services.
- Workload subscriptions own ACA, workload VNets/subnets, private endpoints, runtime identities, and workload resource groups.
- Shared private DNS belongs with platform services unless there is a strong reason not to.

### Networking

- Keep the workload VNet in the workload subscription.
- Keep separate app and data/private-endpoint subnets.
- Remember that PaaS resources do not live inside subnets; their private endpoint NICs do.

### Deployment Stacks

- Treat stacks as first-class lifecycle management, not optional wrappers.
- Keep non-prod teardown safe and explicit.
- Do not weaken guardrails on production teardown without an explicit reason.

### Monitoring

- Prefer Azure Monitor, App Insights, Log Analytics, Workbooks, and alerts over ad hoc tooling.
- Keep workbook/workspace/resource placement aligned with the platform model already chosen in this repo.
- App runtime logs should remain structured JSON on stdout/stderr so Azure Container Apps console logs stay useful even when Application Insights sampling changes.
- Keep browser-origin telemetry server-relayed and allowlisted; ACA only sees it after the app API validates and logs it.
- Future .NET services should use the same Azure-native path: OpenTelemetry-compatible logs/traces, structured stdout for ACA logs, and the platform-owned Log Analytics/Application Insights resources.

## Verification

When Azure files change, prefer this set:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
az bicep build --file infra/azure/bicep/main.web.rg.bicep
az bicep build --file infra/azure/bicep/main.web.monitoring.rg.bicep
```

Run narrower Bicep builds when only one entrypoint changed, but do not skip verification entirely.

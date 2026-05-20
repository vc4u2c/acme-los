# Azure Platform Plan

This doc captures the recommended Azure target architecture for ACME LOS.

It is intentionally opinionated:

- use current Azure best practices
- stay cost-conscious for a pay-as-you-go subscription
- keep the path clean for later growth
- avoid designs that only make sense for a large enterprise team

Related docs:

- [Release and delivery](./release-and-delivery.md)
- [Azure governance and lifecycle](./azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Azure monitoring and workbooks](./azure-monitoring-and-workbooks.md)
- [Azure naming standard](../reference/azure-resource-naming-standard.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Current platform architecture](../architecture/current-platform.md)

## How To Read This Doc

This page has two jobs:

- record the current observed Azure state
- preserve the target architecture and rollout strategy

When you need exact commands, use
[Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md). When you
need a live presenter path, use
[Azure and website demo runbook](./azure-and-website-demo-runbook.md).

## Current Observed Platform State

Current confirmed state from the local CLI setup:

- Azure CLI is authenticated
- current visible tenants:
  - `73521cbe-9858-4230-996d-319b8074e103`
    - `Default Directory`
    - `vc4u2cgmail.onmicrosoft.com`
    - active Azure tenant for the current subscription
  - `b907d549-84e1-4733-b7be-d459594670c4`
    - `b2c-vc4u2cmsaldemo-dev`
    - legacy `AAD B2C` tenant candidate for retirement review
  - `ddf05cf2-068e-4463-9996-aa1c61b2439b`
    - `react-swa-b2c-demo`
    - legacy `AAD B2C` tenant candidate for retirement review
- currently visible subscriptions:
  - `sub-acme-platform`
    - subscription id `b582269b-60ff-4bb0-b30b-6fb2796edf11`
  - `sub-acme-nonprod-online`
    - subscription id `7df9ce70-48a3-4495-9361-4ca7b2637748`
  - `sub-acme-prod-online`
    - subscription id `b85326eb-4485-480a-9849-40669d306e44`
  - `sub-acme-sandbox`
    - subscription id `8c1de55b-9d38-4cfa-bc91-ec053bdaf275`
- current management groups:
  - tenant root group `73521cbe-9858-4230-996d-319b8074e103`
  - `mg-acme`
  - `mg-acme-platform`
  - `mg-acme-landingzones`
  - `mg-acme-online`
  - `mg-acme-sandbox`
- current subscription placement:
  - `sub-acme-platform` is attached to `mg-acme-platform`
  - `sub-acme-nonprod-online` is attached to `mg-acme-online`
  - `sub-acme-prod-online` is attached to `mg-acme-online`
  - `sub-acme-sandbox` is attached to `mg-acme-sandbox`
- current budget state:
  - monthly budget `bdg-acme-platform-monthly-01` exists on `sub-acme-platform`
    - amount `$10`
  - monthly budget `bdg-acme-nonprod-online-monthly-01` exists on `sub-acme-nonprod-online`
    - amount `$20`
  - monthly budget `bdg-acme-prod-online-monthly-01` exists on `sub-acme-prod-online`
    - amount `$15`
  - monthly budget `bdg-acme-sandbox-monthly-01` exists on `sub-acme-sandbox`
    - amount `$5`
- current platform network state:
  - `rg-acme-hub-network-cus-01` exists in `sub-acme-platform`
  - shared private DNS zones exist for:
    - `privatelink.vaultcore.azure.net`
    - `privatelink.redis.azure.net`
- current workload proof point:
  - `dev` is deployed in `sub-acme-nonprod-online`
  - web runtime is on `Azure Container Apps`
  - `Key Vault` and `Azure Managed Redis` are private-only
  - ACA ingress remains public for now
  - the first Azure Monitor operations pack is deployed in `dev`
    - Log Analytics
    - Application Insights
    - workbook
    - action group
    - log alerts
  - current public health endpoint responds successfully
- current CD status:
  - main CI completion deploys `dev`
  - reusable wrappers exist for `qa`, `stg`, and `prod`
  - chained promotion beyond `dev` is still pending
- GitHub CLI is authenticated
- GitHub deployment environments already exist:
  - `dev`
  - `qa`
  - `stg`
  - `prod`

That means the current planning assumption is:

- we know the repo side is ready
- the target platform, non-production, and production subscriptions now exist
- the sandbox subscription also exists for controlled experiments and ADE-style work
- the landing-zone hierarchy now exists and can be expanded cleanly
- the cost guardrails are on the real target subscriptions
- the first ACA workload path is proven in `dev`

## Executive Summary

Recommended target:

- use `Bicep` as the IaC source of truth
- use `Azure Verified Modules (AVM)` where they fit, and local composition modules where they do not
- use a persistent enterprise structure:
  - management groups
  - subscriptions
  - workload identities
  - governance
- keep the four persistent environments you already have:
  - `dev`
  - `qa`
  - `stg`
  - `prod`
- use `GitHub Actions` with `OpenID Connect` and environment-scoped workload identities
- deploy the `web app` and `mobile app` separately
- use `Azure Front Door Premium + WAF` for public web entry
- use `private endpoints` and `private DNS` for origin and state/data services
- use `Azure Managed Redis` as the current Azure state backend
- use `Deployment Stacks` for managed teardown of non-production infrastructure

Important platform choice:

- do **not** build new work on `Azure Blueprints`
- Microsoft Learn now says Azure Blueprints is deprecated on **July 11, 2026**
- use `Azure Policy`, `Bicep`, `Template Specs` if needed, and `Deployment Stacks` instead

Important scope choice:

- do **not** deploy the full Azure Landing Zones Enterprise-Scale reference implementation for this repo right now
- do follow Azure Landing Zones design principles
- this should be an `ALZ-lite` workload architecture, not a heavyweight enterprise platform rollout

## Guidance We Are Following

Main references:

- Azure Landing Zones / Enterprise-Scale:
  - https://github.com/Azure/Enterprise-Scale
- Cloud Adoption Framework naming guidance:
  - https://learn.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming-and-tagging-decision-guide
- Azure Deployment Environments:
  - https://learn.microsoft.com/azure/deployment-environments/overview-what-is-azure-deployment-environments
- Azure deployment stacks for Bicep:
  - https://learn.microsoft.com/azure/azure-resource-manager/bicep/deployment-stacks
- Azure Container Apps workload profiles:
  - https://learn.microsoft.com/azure/container-apps/workload-profiles-overview
- Front Door Premium private link to Container Apps:
  - https://learn.microsoft.com/azure/container-apps/how-to-integrate-with-azure-front-door
- Azure Managed Redis:
  - https://learn.microsoft.com/azure/azure-cache-for-redis/managed-redis/managed-redis-overview
- GitHub Actions deployment environments:
  - https://docs.github.com/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment

## Recommended Azure Topology

### Enterprise Structure Should Be Persistent

Create the enterprise structure once and keep it.

That means these should usually be persistent:

- management groups
- subscriptions
- GitHub environments
- workload identities
- policy assignments
- RBAC structure
- shared hub resources

Do **not** create and destroy subscriptions every day.

Why:

- subscriptions themselves do not meaningfully cost money
- the costs come from the resources you run inside them
- daily subscription churn makes RBAC, OIDC, policy inheritance, and automation much harder to keep reliable

The right teardown boundary is:

- ephemeral resource groups
- ephemeral spokes
- ephemeral preview or sandbox environments
- non-production application resources when you truly want to turn them off

Not:

- the management-group hierarchy
- the subscription topology

### Management Group Strategy

Recommended lightweight enterprise hierarchy:

- `mg-acme`
  - top-level organization
- `mg-acme-platform`
  - shared platform controls
- `mg-acme-landingzones`
  - workload landing zones
- `mg-acme-online`
  - online workload archetype, including ACME LOS
- `mg-acme-sandbox`
  - sandbox subscription and ADE-style ephemeral environments

This gives you:

- policy inheritance
- clean separation of shared platform and workloads
- room for multiple applications later

Important nuance:

- keep the management-group hierarchy archetype-focused
- keep environment separation at the subscription and workload layer
- do **not** create management groups just for `dev`, `qa`, `stg`, and `prod`

### Hub-And-Spoke Direction

If you expect multiple applications, the target network model should be hub-and-spoke.

Recommended target:

- shared `hub`
  - Front Door
  - shared networking
  - shared private DNS
  - shared monitoring
  - optional shared non-production Redis
- workload `spokes`
  - `acme-los`
  - future workloads

Important nuance:

- you should design for hub-and-spoke now
- you do **not** need to deploy a huge expensive hub on day one

Use an `ALZ-lite` hub first, then grow it as more workloads appear.

### Keep The Four Persistent Environments

Persistent environments:

- `dev`
- `qa`
- `stg`
- `prod`

These are long-lived promotion environments, not short-lived previews.

Important rule for this repo:

- there is no separate `test` environment
- `qa` is the shared validation environment for both broader QA and Okta/auth checks

Current environment and Okta mapping:

- `local`
  - local developer runs
  - points to Okta `dev`
- `dev`
  - shared cloud development environment
  - points to Okta `dev`
- `qa`
  - shared validation environment
  - points to Okta `qa`
- `stg`
  - pre-production environment
  - can stay aligned to Okta `qa` at first or split later if needed
- `prod`
  - production environment
  - points to Okta `prod`

UI expectation for both apps:

- always show the active environment somewhere visible in the shell
- local runs should display `local`
- deployed environments should display their environment name exactly:
  - `dev`
  - `qa`
  - `stg`
  - `prod`

### Subscription Strategy

Best balanced target:

1. `platform` subscription
   - shared edge and hub resources
   - shared private DNS
   - shared monitoring

2. `nonprod-online` subscription
   - `dev`
   - `qa`
   - `stg`
   - shared non-production ACR

3. `prod-online` subscription
   - `prod`

4. `sandbox` subscription

- ADE or temporary preview environments
- playground workloads

Why this is the right balance:

- subscriptions are free; cost comes from resources, not the subscription containers
- this gives you meaningful blast-radius separation
- it is much lighter than a full enterprise multi-subscription estate
- it still aligns well with Azure landing zone principles

If you want the absolute cheapest first step, you can start with a single subscription and the same naming, tags, and resource-group layout, then split later. But the recommended target is `shared + nonprod + prod`.

Recommended interpretation of that target for this repo:

- `platform`
- `nonprod-online`
- `prod-online`
- `sandbox`

Keep those subscriptions persistent. Tear down workloads, not subscriptions.

### Resource Group Strategy

Recommended resource groups:

- platform / hub:
  - `rg-acme-hub-edge-<region>-01`
  - `rg-acme-hub-monitor-<region>-01`
  - `rg-acme-hub-network-<region>-01`
  - `rg-acme-hub-images-<region>-01`

- workload non-production:
  - `rg-acme-los-web-dev-<region>-01`
  - `rg-acme-los-web-qa-<region>-01`
  - `rg-acme-los-web-stg-<region>-01`

- workload production:
  - `rg-acme-los-web-prod-<region>-01`

Keep shared services out of the app resource groups.

## Recommended Hosting Model

### Web App

Recommended now:

- deploy the Next.js web app to `Azure Container Apps`
- build and publish a container image to a shared `Azure Container Registry` in the target subscription role
- use a user-assigned managed identity for runtime access to `Key Vault`, `ACR`, and Redis

Why ACA is the better fit now:

- it keeps the workload container-native from the start
- it aligns better with later service expansion than App Service
- it works cleanly with managed identity for image pulls and secret references
- it keeps the future Front Door + private-link path open once the base workload is stable

Current recommendation:

- `Container Apps` is the primary path
- `App Service` is no longer the target deployment model for this repo

### Mobile App

The mobile app should not be treated as an Azure-hosted workload.

Recommended delivery split:

- `web`
  - deploy to Azure
- `mobile`
  - release through Expo/EAS and app-store pipelines

That means:

- separate workflows
- separate secrets
- separate promotion logic
- shared version awareness, but not shared deployment mechanics

## Edge, Security, And Networking

### Public Edge

Recommended:

- `Azure Front Door Premium`
- `WAF policy`
- managed rule sets enabled
- custom rules for rate limiting and route protection where needed

Why Premium:

- private link origin support is the main reason
- it lets Front Door reach the `Container Apps` origin privately once the workload-profiles environment is in place

Recommended split:

- one `nonprod` Front Door Premium profile for `dev`, `qa`, and `stg`
- one `prod` Front Door Premium profile for `prod`

That is the best balance between:

- cost
- separation
- operational simplicity

### Origin Privacy

Recommended:

- Container Apps origin behind `private endpoint`
- Front Door Premium connected through `Private Link`
- lock down public reachability of the origin as far as the service capabilities allow

### Private DNS

Use private DNS zones for each service that needs private name resolution.

Important nuance:

- some resource names can follow your naming convention
- `private DNS zone names` are often fixed by the service itself and are therefore an exception

Examples:

- Key Vault private endpoint zone:
  - `privatelink.vaultcore.azure.net`
- Storage blob private endpoint zone:
  - `privatelink.blob.core.windows.net`

Recommendation:

- keep DNS zone resource groups and links cleanly organized
- do not try to force naming prefixes onto service-defined zone names

### State And Secret Services

Recommended:

- `Azure Managed Redis`
  - expected cloud session/state backend
- `Key Vault`
  - per environment
- `Storage`
  - if needed for artifacts, exports, or supporting app data

Cost-conscious Redis recommendation:

- one shared `nonprod` Redis for `dev`, `qa`, and `stg`, with strict key prefix separation
- one dedicated `prod` Redis

This is a compromise:

- cheaper than four Redis instances
- cleaner than trying to keep file fallback in Azure

## Identity And Deployment Authentication

### Recommended GitHub To Azure Model

Use:

- `GitHub Actions`
- `OpenID Connect`
- environment-scoped `federated credentials`
- no long-lived Azure client secrets in GitHub

This is the right pattern for modern Azure deployments.

### Workload Identity Recommendation

Best recommendation:

- one deployment identity per environment
- environment-scoped federation

For this repo, either of these can work:

- `Microsoft Entra application registration` per environment
- `user-assigned managed identity` per environment

Recommendation:

- use `app registrations` plus service principals for the GitHub OIDC deployment path right now
- revisit `user-assigned managed identities` later if you move parts of the deployment or runtime deeper into Azure-native automation
- keep human access and machine deployment identities separate

### GitHub Environment Names

Keep these exactly aligned across GitHub and Azure docs:

- `dev`
- `qa`
- `stg`
- `prod`

## Bicep Strategy

### Source Of Truth

Use:

- `Bicep`
- `bicepparam` files
- `Azure Verified Modules`
- local composition modules

Recommended repo layout:

```text
infra/azure/
  bicep/
    modules/
      hub/
      shared/
      workloads/
        web/
      web/
      network/
      security/
    stacks/
      shared/
      web-environment/
    main.hub.sub.bicep
    main.workload.sub.bicep
    main.web.rg.bicep
    dev.bicepparam
    qa.bicepparam
    stg.bicepparam
    prod.bicepparam
```

Recommended scopes:

- subscription-scope Bicep
  - resource groups
  - role assignments
  - managed identities
  - hub networking scaffolding
- resource-group-scope Bicep
  - app service
  - Redis linkage
  - Key Vault
  - monitoring
  - private endpoints

### Use Deployment Stacks

Use `Deployment Stacks` for:

- non-production environment deployments
- ephemeral spokes
- safe teardown
- control over unmanaged resource deletion

This is the clean replacement for old blueprint-style thinking.

## Azure Deployment Environments And Blueprints

### Azure Blueprints

Do not use `Azure Blueprints` for new work here.

Why:

- Microsoft says Blueprints are deprecated on `July 11, 2026`
- the migration path is:
  - Azure Policy
  - ARM/Bicep
  - Deployment Stacks

### Azure Deployment Environments

`Azure Deployment Environments (ADE)` is useful here, but not as the primary implementation for the four persistent environments.

Current decision:

- do not replace the `dev`, `qa`, `stg`, and `prod` GitHub Actions promotion path with ADE
- use ADE later from `sub-acme-sandbox` for on-demand preview, demo, and developer environments
- keep ADE catalogs pointed at the same Bicep modules and scripts where possible so it does not become a second infrastructure implementation

Use ADE for:

- ephemeral preview environments
- on-demand demo environments
- developer sandboxes
- temporary integration validation environments

Do not use ADE first for:

- your core `dev`, `qa`, `stg`, `prod` promotion path

So the right split is:

- persistent pipeline environments:
  - GitHub Actions + Bicep + Deployment Stacks
- ephemeral on-demand environments:
  - ADE in the sandbox lane later

First ADE candidate:

- dev center/project scoped to ACME LOS sandbox work
- environment types for `preview` and `demo`
- catalog definitions that reuse the workload Bicep entrypoints instead of portal-authored resources
- cost controls that pair ADE expiration with the existing budget and teardown posture

## CI/CD Target Model

### Web

Recommended flow:

1. validate
   - lint
   - test
   - build
   - infra lints and `what-if`
2. build web deployable
3. push web artifact/image
4. deploy infrastructure through `Deployment Stacks`
5. deploy web app
6. smoke checks

### Mobile

Recommended flow:

1. validate
   - lint
   - test
   - build
2. create mobile release artifact
3. push to EAS / store pipeline
4. promote separately from Azure web deployment

The repo already has reusable web deployment wrappers and a separate manual
mobile deployment workflow. The next delivery evolution is to decide how higher
web environments are promoted after `dev`, then add environment-specific mobile
promotion only when the mobile release path is ready.

## Cost-Conscious Rollout Plan

### Completed Base Slice

The base slice is now in place:

- persistent management groups and target subscriptions exist
- naming and tagging standards exist in the repo
- Azure/GitHub environment metadata is source controlled
- Bicep modules and deployment scripts exist
- the platform network foundation exists
- the `dev` web workload is proven on ACA with Redis, Key Vault, private
  endpoints, monitoring, and deployment stacks

### Next Rollout Slice

The next slice should prove repeatability before adding edge complexity:

1. deploy `qa` through the same stack-backed script path
2. verify Okta `qa` callback and logout URLs against the deployed `qa` ACA URL
3. wire notification receivers into the non-production action group
4. decide how to invoke promotion beyond `dev`
5. deploy `stg` only after `qa` is boring and repeatable

### Edge And Production Slice

- add Front Door Premium and WAF after the public ACA path is stable in
  non-production
- move toward private-origin ACA ingress after Front Door is ready
- deploy `prod` with tighter approvals, alert routing, and production-specific
  operational checks
- keep production teardown explicit and warning-gated

### Sandbox Slice

- add ADE for ephemeral preview/sandbox environments
- add Sentinel only if the cost/benefit is justified

## Sentinel Recommendation

Be careful with `Microsoft Sentinel` in a pay-as-you-go playground.

Recommendation:

- do not make Sentinel part of the first implementation
- start with:
  - Log Analytics
  - diagnostic settings
  - Azure Monitor alerts
  - Defender plans only if justified
- add Sentinel later for:
  - production security monitoring
  - detection engineering
  - incident workflows

For this repo and this phase, Sentinel is likely premature from a cost perspective.

## Concrete Next Implementation Steps

The repo now has the first implementation scaffold:

- [infra/azure/README.md](../../infra/azure/README.md)
- [infra/azure/config/platform.json](../../infra/azure/config/platform.json)
- [infra/azure/config/governance.json](../../infra/azure/config/governance.json)
- [infra/azure/bicep/main.hub.sub.bicep](../../infra/azure/bicep/main.hub.sub.bicep)
- [infra/azure/bicep/main.platform.network.rg.bicep](../../infra/azure/bicep/main.platform.network.rg.bicep)
- [infra/azure/bicep/main.platform.workload-links.rg.bicep](../../infra/azure/bicep/main.platform.workload-links.rg.bicep)
- [infra/azure/bicep/main.workload.sub.bicep](../../infra/azure/bicep/main.workload.sub.bicep)
- [infra/azure/bicep/main.web.rg.bicep](../../infra/azure/bicep/main.web.rg.bicep)
- [tools/scripts/azure/setup-github-azure-environments.ps1](../../tools/scripts/azure/setup-github-azure-environments.ps1)
- [tools/scripts/azure/bootstrap-governance.ps1](../../tools/scripts/azure/bootstrap-governance.ps1)
- [tools/scripts/azure/ensure-subscription-budget.ps1](../../tools/scripts/azure/ensure-subscription-budget.ps1)
- [tools/scripts/azure/deploy-platform-network.ps1](../../tools/scripts/azure/deploy-platform-network.ps1)
- [tools/scripts/azure/deploy-web-environment.ps1](../../tools/scripts/azure/deploy-web-environment.ps1)
- [tools/scripts/azure/teardown-web-environment.ps1](../../tools/scripts/azure/teardown-web-environment.ps1)

Next implementation steps:

1. keep budget, governance, platform-network, and GitHub/Azure environment
   bootstrap commands rerunnable as the baseline
2. deploy `qa` with the current stack-backed web deployment path
3. verify `qa` health, Okta redirect/logout behavior, Redis session continuity,
   and workbook/alert creation
4. wire action-group receivers for non-production alerts
5. decide the promotion trigger model beyond automatic `dev`
6. deploy `stg` after `qa` is repeatable
7. deploy `prod` only after alert routing, approvals, and smoke checks are
   explicit
8. keep the `prod` teardown path explicit and warning-gated

Current implementation note:

- the current platform deploy creates shared private DNS zones in the platform landing zone
- each workload environment deploy creates its own spoke VNet, private endpoints, and platform DNS link stack
- the current workload stack deploys one Azure Managed Redis instance per deployed environment
- the current Azure runtime target uses Microsoft Entra auth to Redis from the ACA user-assigned managed identity
- the current web deployable deploys both the public Next ACA app and the
  internal BFF ACA app when BFF deployment is enabled
- the internal BFF app follows the environment runtime replica settings by
  default, unless an explicit `bffRuntime` override is added
- the runtime templates support optional Entra managed-identity service auth
  between Next and the BFF through `bffRuntime.serviceAuth`; enable it only
  after the BFF API audience and token scope exist for that environment
- the `dev` Redis managed-identity path was live-verified on April 19, 2026
- Azure Redis access-key authentication is disabled; connection-string auth is retained only for local Docker Redis
- shared ACR is split by subscription role:
  - `nonprod` ACR for `dev`, `qa`, and `stg`
  - `prod` ACR for `prod`
- ACA remains public for now, while Key Vault and Azure Managed Redis are private-only
- because this is a pay-as-you-go setup, non-production environments should be torn down promptly after validation

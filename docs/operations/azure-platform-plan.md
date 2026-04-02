# Azure Platform Plan

This doc captures the recommended Azure target architecture for ACME LOS.

It is intentionally opinionated:

- use current Azure best practices
- stay cost-conscious for a pay-as-you-go subscription
- keep the path clean for later growth
- avoid designs that only make sense for a large enterprise team

Related docs:

- [Release and delivery](./release-and-delivery.md)
- [Azure naming standard](../reference/azure-resource-naming-standard.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Current platform architecture](../architecture/current-platform.md)

## Current Observed Starting State

Current confirmed state from the local CLI setup:

- Azure CLI is authenticated
- currently visible subscription:
  - `sub-vc4u2c-demo`
  - subscription id `7a75b50d-e8d6-49fe-ab21-cbb159c3fed6`
- GitHub CLI is authenticated
- GitHub deployment environments already exist:
  - `dev`
  - `qa`
  - `stg`
  - `prod`

One important caveat:

- listing management groups failed because the Azure CLI refresh token needs to be refreshed for that command path
- before we implement the landing zone, refresh Azure CLI auth so we can inspect or create the management-group hierarchy cleanly

That means the current planning assumption is:

- we know the repo side is ready
- we know at least one Azure subscription is available now
- we should design for the enterprise target shape immediately, even if the first rollout starts in the current subscription

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
- use `Azure Managed Redis` as the expected cloud state backend
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
- App Service private endpoints:
  - https://learn.microsoft.com/azure/app-service/networking/private-endpoint
- Front Door Premium private link to App Service:
  - https://learn.microsoft.com/azure/frontdoor/standard-premium/how-to-enable-private-link-web-app
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
- `mg-acme-nonprod`
  - non-production workload subscriptions
- `mg-acme-prod`
  - production workload subscriptions
- optional `mg-acme-sandbox`
  - ephemeral or ADE-based environments later

This gives you:

- policy inheritance
- clean separation of shared platform and workloads
- room for multiple applications later

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
   - optional shared ACR
   - optional shared non-production Redis

2. `nonprod` subscription
   - `dev`
   - `qa`
   - `stg`

3. `prod` subscription
   - `prod`

Optional later:

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
- `nonprod`
- `prod`

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

- deploy the Next.js web app to `Azure App Service for Linux`
- package it as a production web artifact that App Service can run predictably

Why not default to Container Apps right now:

- App Service is simpler for this repo today
- private endpoint and Front Door Premium patterns with App Service are mature and well-documented
- the repo is still one main web workload, not a microservice fleet

When to choose Container Apps instead:

- if the web tier becomes one of several independently scaled services
- if you want Dapr, jobs, sidecars, or a more service-oriented topology

Current recommendation:

- `App Service` is the cleaner fit today
- revisit `Container Apps` later only if the workload shape changes

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
- it lets Front Door reach the App Service origin privately

Recommended split:

- one `nonprod` Front Door Premium profile for `dev`, `qa`, and `stg`
- one `prod` Front Door Premium profile for `prod`

That is the best balance between:

- cost
- separation
- operational simplicity

### Origin Privacy

Recommended:

- App Service origin behind `private endpoint`
- Front Door Premium connected through `Private Link`
- lock down public reachability of the origin as far as the service capabilities allow

### Private DNS

Use private DNS zones for each service that needs private name resolution.

Important nuance:

- some resource names can follow your naming convention
- `private DNS zone names` are often fixed by the service itself and are therefore an exception

Examples:

- App Service private endpoint zone:
  - `privatelink.azurewebsites.net`
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

- use `user-assigned managed identities` if you want Azure-native lifecycle and clear ownership in the subscription
- use `app registrations` only if you need tenant-level setup before Azure resources exist

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
  - ADE later

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
4. deploy infrastructure
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

That means the current shared `deployable` workflow should evolve into:

- `deploy-web-*.yml`
- `deploy-mobile-*.yml`

## Cost-Conscious Rollout Plan

### Phase 1

- create persistent management groups and subscriptions
- create naming standard
- create Azure/GitHub environment model
- create Bicep structure
- create hub + workload split in the module layout

### First Implementation Slice

This is the exact order I recommend from here:

1. refresh Azure CLI auth
   - so management groups and tenant-wide setup commands work cleanly
2. inspect or create the management group hierarchy
   - `mg-acme`
   - `mg-acme-platform`
   - `mg-acme-landingzones`
   - `mg-acme-nonprod`
   - `mg-acme-prod`
3. decide whether to create the persistent subscriptions now
   - `sub-acme-platform`
   - `sub-acme-nonprod`
   - `sub-acme-prod`
4. scaffold `infra/azure`
   - hub modules
   - workload modules
   - shared naming and tag modules
5. add the GitHub/Azure bootstrap script
   - environment identities
   - repo variables
   - environment variables
6. deploy `dev` first
   - App Service on Linux
   - Key Vault
   - Redis
   - monitoring
7. add teardown for non-production workload stacks only

That gives us a real landing-zone-aligned implementation without waiting on Front Door.

### Phase 2

- deploy the shared hub edge and base monitoring
- deploy `dev` first
- validate OIDC, Front Door, private endpoints, Redis, Key Vault

### Phase 3

- add `qa`
- add `stg`
- keep them on the non-production Front Door and non-production Redis

### Phase 4

- add `prod`
- use separate Front Door profile
- use separate Redis
- tighten approvals and deployment protections

### Phase 5

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

1. create `infra/azure` with Bicep entry points and AVM-backed modules
2. add a formal naming standard and tags
3. create a GitHub/Azure environment setup script for `dev`, `qa`, `stg`, `prod`
4. split the deploy workflows into `web` and `mobile`
5. deploy `dev` first
6. add a manual `teardown-nonprod` workflow using Deployment Stacks
7. add `qa`, `stg`, and then `prod`

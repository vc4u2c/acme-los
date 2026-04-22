# Azure Governance And Lifecycle

This doc is the operational source of truth for Azure governance, identity, and
cleanup for ACME LOS.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Azure naming standard](../reference/azure-resource-naming-standard.md)
- [Azure infrastructure scaffold](../../infra/azure/README.md)

## Principles

This Azure setup should follow a few non-negotiable rules:

- prefer `Bicep`, scripts, and GitHub automation over portal clicks
- make every script safe to rerun
- keep deterministic naming and scope boundaries
- treat teardown as a first-class workflow
- keep governance persistent and workloads disposable
- use current Azure guidance, not deprecated patterns such as Blueprints
- put cost guardrails in place before the first real workload deployment

## Management Group Model

The target management-group structure is:

- `mg-acme`
  - root organizational management group
- `mg-acme-platform`
  - shared platform controls and subscriptions
- `mg-acme-landingzones`
  - landing-zone parent
- `mg-acme-online`
  - online workloads such as ACME LOS
- `mg-acme-sandbox`
  - sandbox subscription and ADE-style ephemeral experiments

Important rule:

- do **not** create management groups for `dev`, `qa`, `stg`, and `prod`
- keep environment separation at the subscription and workload layer instead

## Subscription Model

Recommended persistent subscriptions:

- `sub-acme-platform`
  - shared edge, networking, monitoring, and other platform resources
- `sub-acme-nonprod-online`
  - `dev`, `qa`, and `stg` workloads
- `sub-acme-prod-online`
  - `prod` workloads

- `sub-acme-sandbox`
  - ephemeral preview and sandbox work

This is the correct teardown boundary:

- keep subscriptions and management groups
- destroy workload resources when cost matters

Current target state:

- `sub-acme-platform`
  - platform subscription
- `sub-acme-nonprod-online`
  - non-production online workload subscription
- `sub-acme-prod-online`
  - production online workload subscription
- `sub-acme-sandbox`
  - sandbox subscription for controlled experiments and ADE-style work

## Identity Model

Use three identity families:

1. human access groups in Entra ID
2. machine deployment identities for GitHub Actions
3. runtime managed identities for Azure workloads

Do not blur those together.

### Human Persona Groups

Recommended Entra groups:

- `entra-acme-platform-admins`
- `entra-acme-platform-readers`
- `entra-acme-network-admins`
- `entra-acme-security-admins`
- `entra-acme-los-nonprod-readers`
- `entra-acme-los-prod-readers`
- `entra-acme-los-support-readers`

These groups are defined in:

- [governance.json](../../infra/azure/config/governance.json)

### Deployment Identities

Recommended machine identities:

- `gha-acme-los-dev`
- `gha-acme-los-qa`
- `gha-acme-los-stg`
- `gha-acme-los-prod`

Each should have:

- one GitHub environment
- one Entra application / service principal
- one OIDC federated credential
- one narrow deployment scope

Runtime identity recommendation for the web workload:

- one user-assigned managed identity per environment
- use it for:
  - Key Vault secret references
  - `AcrPull`
  - Redis Entra token acquisition
- keep runtime managed identities separate from GitHub deployment identities

## RBAC Matrix

Recommended first-pass RBAC:

| Principal                        | Persona / Use Case          | Role                                                | Scope                                   |
| -------------------------------- | --------------------------- | --------------------------------------------------- | --------------------------------------- |
| `entra-acme-platform-admins`     | platform ownership          | `Contributor` + `User Access Administrator`         | `sub-acme-platform`                     |
| `entra-acme-platform-readers`    | platform visibility         | `Reader`                                            | `sub-acme-platform`                     |
| `entra-acme-network-admins`      | network operations          | `Network Contributor`                               | `rg-acme-hub-network-cus-01`            |
| `entra-acme-security-admins`     | vault and monitoring admin  | `Key Vault Administrator`, `Monitoring Contributor` | platform security and monitoring scopes |
| `entra-acme-los-nonprod-readers` | nonprod workload visibility | `Reader`                                            | `sub-acme-nonprod-online`               |
| `entra-acme-los-prod-readers`    | prod workload visibility    | `Reader`                                            | `sub-acme-prod-online`                  |
| `entra-acme-los-support-readers` | troubleshooting and support | `Reader`, `Monitoring Reader`                       | workload resource groups only           |
| `gha-acme-los-dev`               | automated dev deploy        | `Contributor`, `User Access Administrator`          | `sub-acme-nonprod-online`               |
| `gha-acme-los-dev`               | platform DNS link updates   | `Contributor`                                       | `rg-acme-hub-network-cus-01`            |
| `gha-acme-los-qa`                | automated qa deploy         | `Contributor`, `User Access Administrator`          | `sub-acme-nonprod-online`               |
| `gha-acme-los-qa`                | platform DNS link updates   | `Contributor`                                       | `rg-acme-hub-network-cus-01`            |
| `gha-acme-los-stg`               | automated stg deploy        | `Contributor`, `User Access Administrator`          | `sub-acme-nonprod-online`               |
| `gha-acme-los-stg`               | platform DNS link updates   | `Contributor`                                       | `rg-acme-hub-network-cus-01`            |
| `gha-acme-los-prod`              | automated prod deploy       | `Contributor`, `User Access Administrator`          | `sub-acme-prod-online`                  |
| `gha-acme-los-prod`              | platform DNS link updates   | `Contributor`                                       | `rg-acme-hub-network-cus-01`            |

Important guardrails:

- prefer resource-group scope for workload deploy identities
- avoid broad subscription-level `Owner`
- keep production identities and human access more constrained than nonprod
- add `PIM` later for high-privilege human groups

Current nuance:

- the deployment bootstrap should target the named platform, non-production, and
  production subscriptions directly
- if a subscription is missing, the bootstrap should fail loudly instead of
  silently falling back to another subscription

## Idempotency Standard

All platform scripts should support safe reruns.

Required behavior:

- create-or-update instead of create-once assumptions
- deterministic names from config
- check-before-create
- check-before-delete
- no hidden local state required for correctness
- clear JSON or console output for automation

This applies to:

- Azure bootstrap scripts
- GitHub environment sync scripts
- workload deploy scripts
- workload teardown scripts
- future Okta environment tooling as well

## Cost Guardrail

The subscription budget is part of the bootstrap path, not an afterthought.

Current configured monthly budgets:

- `bdg-acme-platform-monthly-01`
  - scope `sub-acme-platform`
  - amount `$10`
- `bdg-acme-nonprod-online-monthly-01`
  - scope `sub-acme-nonprod-online`
  - amount `$20`
- `bdg-acme-prod-online-monthly-01`
  - scope `sub-acme-prod-online`
  - amount `$15`
- `bdg-acme-sandbox-monthly-01`
  - scope `sub-acme-sandbox`
  - amount `$5`
- shared notifications:
  - actual `50%`
  - actual `80%`
  - actual `100%`
  - forecast `100%`

Bootstrap command:

```powershell
npm run azure:budget
```

## Bootstrap And Teardown Model

What stays persistent:

- management groups
- subscriptions
- GitHub environments
- deployment identities
- policy assignments
- RBAC model
- shared platform resource groups

What is safe to destroy:

- `dev`
- `qa`
- `stg`
- temporary demo or sandbox workloads

What should not be automatically destroyed:

- `prod`
- platform subscriptions
- management groups
- shared hub foundations

## Current Repo Commands

Current commands in this repo:

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

What they mean today:

- `azure:budget`
  - creates or updates the configured monthly budgets for all target subscriptions
- `azure:show-governance`
  - shows the target management-group hierarchy and current entity placement
- `azure:bootstrap:governance`
  - creates or updates the management-group hierarchy
- `azure:show-plan`
  - shows the GitHub/Azure environment contract for the current config
- `azure:deploy:platform-network`
  - deploys the persistent platform network RG resources and shared private DNS zones
- `azure:bootstrap`
  - bootstraps GitHub environments, repo vars, environment vars, OIDC deployment identities, and scoped platform-network access
- `azure:deploy:web`
  - deploys the subscription-scope workload stack, the resource-group-scope web infrastructure stack, and the platform DNS link stack for the environment
- `azure:teardown`
  - deletes the platform DNS link stack, deletes the workload stacks, and purges the deleted Key Vault when present

## Deployment Stack Policy

Use deployment stacks from the start for workload lifecycle management.

Recommended split:

- `dev`
  - stack-managed deploy and teardown
- `qa`
  - stack-managed deploy and teardown
- `stg`
  - stack-managed deploy and teardown
- `prod`
  - stack-managed deploy
  - teardown available only with explicit destructive confirmation

That gives us:

- atomic workload lifecycle boundaries
- safer cleanup
- cleaner drift handling
- a direct replacement for the old blueprint-style lifecycle model

## Manual Steps That Still Exist

These are currently acceptable manual steps:

- tenant-level management-group creation if the account or permission model does not allow full automation yet
- subscription creation and placement if the account cannot automate subscription aliases yet
- first-time Azure sign-in
- later custom DNS and certificate proof steps for public edge services

These manual steps should always be documented and should stay rare.

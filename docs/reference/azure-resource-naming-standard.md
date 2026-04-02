# Azure Resource Naming Standard

This doc defines the Azure naming standard for the ACME platform and the ACME LOS workload.

It follows the Azure Cloud Adoption Framework guidance, but it also adds
project-specific rules for resources that are easy to let drift.

Main reference:

- https://learn.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming-and-tagging-decision-guide

Related docs:

- [Azure platform plan](../operations/azure-platform-plan.md)
- [GitHub and Azure environments](../operations/github-azure-environments.md)

## Goals

The naming standard should:

- be easy to scan
- be consistent across environments
- work with Azure resource limits
- separate production from non-production clearly
- leave room for growth

## Standard Components

Preferred component order:

1. resource type abbreviation
2. organization or portfolio
3. workload or platform scope
4. component or role
5. environment
6. region
7. instance number

Example:

```text
<type>-<org>-<workload-or-scope>-<component>-<env>-<region>-<nn>
```

Example:

```text
app-acme-los-web-prod-cus-01
```

Important split:

- `acme`
  - company / portfolio / shared platform
- `acme-los`
  - workload / product

That means:

- hub or shared resource names should usually use `acme`
- workload or spoke resource names should usually use `acme-los`

## Standard Environment Abbreviations

Use these exactly:

- `dev`
- `qa`
- `stg`
- `prod`

Do not mix:

- `stage`
- `staging`
- `prd`
- `production`

Use the full word in documentation if helpful, but the resource name abbreviation should stay standardized.

## Region Abbreviations

Pick a short region code set once and keep it stable.

Suggested examples:

- `cus` = `centralus`
- `eus2` = `eastus2`

If you later add a secondary region, document that mapping in the repo and keep using the same abbreviations everywhere.

## Resource Type Prefixes

Use these prefixes unless a service forces a different name format.

### Governance And Scope

- management group: `mg`
- subscription display name: `sub`
- resource group: `rg`
- policy assignment: `pa`
- policy initiative: `pi`
- role assignment helper name: `ra`

### Networking And Edge

- virtual network: `vnet`
- subnet: `snet`
- private endpoint: `pep`
- network security group: `nsg`
- route table: `rt`
- public IP: `pip`
- Front Door profile: `afd`
- Front Door endpoint: `afde`
- WAF policy: `waf`

### Compute And App Hosting

- App Service plan: `asp`
- web app: `app`
- deployment slot: `slot`
- user-assigned managed identity: `uami`

### Data And State

- Key Vault: `kv`
- storage account: `st`
- blob container: `blbcon`
- Azure Managed Redis: `redis`
- SQL server: `sql`
- SQL database: `sqldb`

### Monitoring

- Log Analytics workspace: `log`
- Application Insights: `appi`
- action group: `ag`
- monitor private link scope: `ampls`

### Images And Packaging

- container registry: `acr`

## Standard Formats

### Names That Support Hyphens

Use this pattern:

```text
<type>-<org>-<workload-or-scope>-<component>-<env>-<region>-<nn>
```

Examples:

- `rg-acme-los-web-dev-cus-01`
- `app-acme-los-web-prod-cus-01`
- `kv-acme-los-web-stg-cus-01`
- `pep-acme-los-redis-qa-cus-01`
- `afd-acme-hub-prod-global-01`

### Names That Do Not Support Hyphens Well

Some Azure resources have strict naming rules.

Use a compressed form:

```text
<prefix><org><workloadOrScope><component><env><region><nn>
```

Examples:

- storage account:
  - `stacmeloswebdevcus01`
- container registry:
  - `acracmelossharedcus01`

## Recommended Resource Names

### Shared Platform

- resource group:
  - `rg-acme-hub-edge-cus-01`
  - `rg-acme-hub-monitor-cus-01`
  - `rg-acme-hub-network-cus-01`
  - `rg-acme-hub-images-cus-01`
- management group:
  - `mg-acme`
  - `mg-acme-platform`
  - `mg-acme-landingzones`
  - `mg-acme-nonprod`
  - `mg-acme-prod`
- subscription display name:
  - `sub-acme-platform`
  - `sub-acme-nonprod`
  - `sub-acme-prod`
- Front Door profile:
  - `afd-acme-hub-nonprod-global-01`
  - `afd-acme-hub-prod-global-01`
- WAF policy:
  - `waf-acme-hub-nonprod-global-01`
  - `waf-acme-hub-prod-global-01`

### Web Environment Resources

- resource group:
  - `rg-acme-los-web-dev-cus-01`
  - `rg-acme-los-web-qa-cus-01`
  - `rg-acme-los-web-stg-cus-01`
  - `rg-acme-los-web-prod-cus-01`
- App Service plan:
  - `asp-acme-los-web-dev-cus-01`
- web app:
  - `app-acme-los-web-dev-cus-01`
- Key Vault:
  - `kv-acme-los-web-dev-cus-01`
- Redis:
  - `redis-acme-hub-nonprod-cus-01`
  - `redis-acme-hub-prod-cus-01`
- Log Analytics:
  - `log-acme-hub-nonprod-cus-01`
  - `log-acme-hub-prod-cus-01`

### Blob Containers

Blob containers should also follow a standard.

Use:

```text
blbcon-<purpose>
```

Examples:

- `blbcon-deployable`
- `blbcon-release-assets`
- `blbcon-web-artifacts`
- `blbcon-app-data`

## Required Exceptions

Some Azure resources cannot follow the generic naming scheme because the service requires a specific name.

### Private DNS Zones

Examples:

- `privatelink.azurewebsites.net`
- `privatelink.vaultcore.azure.net`
- `privatelink.blob.core.windows.net`

These are expected exceptions. Do not try to prefix them.

### GitHub Environments

Keep these simple:

- `dev`
- `qa`
- `stg`
- `prod`

Do not try to embed the project name in the GitHub environment name.

## Recommended Tags

Every Azure resource group and resource should carry these tags where supported:

- `Application = acme-los`
- `Portfolio = acme`
- `Workload = web`
- `Environment = dev|qa|stg|prod`
- `Owner = <team-or-person>`
- `ManagedBy = bicep`
- `SourceRepo = vc4u2c/acme-los`
- `Criticality = low|medium|high`
- `DataClassification = internal|confidential`
- `CostCenter = <value>`
- `Lifecycle = persistent|ephemeral`

## Naming Rules To Keep Rigid

1. One environment abbreviation set only.
2. One region abbreviation set only.
3. One resource-type prefix table only.
4. Do not improvise spellings.
5. Do not mix singular and plural component names casually.
6. Use instance numbers even when only one instance exists today if the resource type is likely to scale later.

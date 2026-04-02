# GitHub And Azure Environments

This doc describes how GitHub environments, Azure deployment identities, and
Bicep parameters should work together for ACME LOS.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure naming standard](../reference/azure-resource-naming-standard.md)
- [Release and delivery](./release-and-delivery.md)

## What We Have Today

The repo already has four GitHub deployment environments:

- `dev`
- `qa`
- `stg`
- `prod`

Current observed state:

- all four environments exist already
- `qa`, `stg`, and `prod` already have required reviewer protection
- `dev` is open, which is appropriate for the first automation path

The repo also already has a helper script:

- [tools/scripts/setup-github-environments.ps1](../../tools/scripts/setup-github-environments.ps1)

And the referenced `Nist.Nvd` repo has a more complete example:

- `C:\Users\vc4u2\Documents\Source\Repos\Azure\Nist.Nvd\.scripts\setup.ps1`
- `C:\Users\vc4u2\Documents\Source\Repos\Azure\Nist.Nvd\.github\workflows\iac.yml`

## What We Learned From Nist.Nvd

The `Nist.Nvd` setup script does a few useful things:

- creates GitHub environments through the GitHub API
- creates one workload identity per environment
- creates federated credentials for:
  - the GitHub environment subject
  - the `main` branch subject
- sets repository variables
- sets environment variables
- sets environment secrets
- passes those values into Bicep through the workflow

That is a solid pattern.

## What We Should Do Better

Use the same overall pattern, but tighten it:

- keep `OpenID Connect`
- keep environment-scoped deployment identities
- avoid long-lived Azure secrets
- reduce the number of secrets stored in GitHub
- prefer Azure-native runtime secret storage in Key Vault
- split `web` deployment from `mobile` deployment
- keep the enterprise structure persistent
- tear down workload resources, not subscriptions

## Recommended Variable And Secret Model

### Repository Variables

Use repository-level variables for non-secret values that are shared across the repo:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID_SHARED`
- `AZURE_SUBSCRIPTION_ID_NONPROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_LOCATION_PRIMARY`
- `AZURE_LOCATION_SECONDARY`
- `PROJECT_NAME`
- `PROJECT_SHORT_NAME`
- `AZURE_ENVIRONMENTS`

Optional:

- `AZURE_RESOURCE_NAME_PREFIX`
- `AZURE_PRIMARY_REGION_SHORT`
- `AZURE_SECONDARY_REGION_SHORT`
- `AZURE_PLATFORM_SUBSCRIPTION_NAME`
- `AZURE_NONPROD_SUBSCRIPTION_NAME`
- `AZURE_PROD_SUBSCRIPTION_NAME`

### Environment Variables

Use GitHub environment variables for non-secret values that differ by environment:

- `AZURE_CLIENT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP_NAME`
- `AZURE_ENVIRONMENT_NAME`
- `AZURE_DEPLOYMENT_STACK_NAME`
- `AZURE_WEB_APP_NAME`
- `AZURE_FRONTDOOR_PROFILE_NAME`
- `AZURE_WAF_POLICY_NAME`
- `AZURE_KEY_VAULT_NAME`
- `AZURE_REDIS_NAME`

Optional:

- `AZURE_CUSTOM_DOMAIN`
- `AZURE_MONITOR_WORKSPACE_NAME`
- `EXPO_CHANNEL`
- `EXPO_ENVIRONMENT_NAME`

### Environment Secrets

Keep GitHub environment secrets as small as possible.

Recommended examples:

- `EXPO_TOKEN`
- `APPLE_APP_STORE_CONNECT_*`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- any short-lived bootstrap-only admin token that cannot yet be removed

What should _not_ live in GitHub secrets long term:

- application runtime secrets for the web app
- session keys if they can live in Key Vault
- long-lived Azure client secrets

## OIDC Recommendation

Use:

- `azure/login@v2`
- `id-token: write`
- one federated identity per environment

Subject format recommendation:

- environment scoped:
  - `repo:<org>/<repo>:environment:dev`
  - `repo:<org>/<repo>:environment:qa`
  - `repo:<org>/<repo>:environment:stg`
  - `repo:<org>/<repo>:environment:prod`

Optional additional subject:

- `repo:<org>/<repo>:ref:refs/heads/main`

Recommendation:

- do not use branch-only trust as the primary deployment control
- let the GitHub environment be the main trust boundary

That way:

- environment approvals matter
- environment secrets and variables stay scoped
- the identity trust model is easier to reason about

## How Bicep Should Consume These Values

Recommended pattern:

1. GitHub Actions logs in with `azure/login@v2`
2. the workflow selects the correct GitHub environment
3. environment `vars` and `secrets` become available to the job
4. the workflow calls:
   - `az deployment sub create`
   - `az deployment group create`
   - or `az stack sub create`
   - or `az stack group create`
5. the workflow passes `bicepparam` and any required overrides

Example:

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  deploy_web_dev:
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v5

      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy web environment
        run: |
          az deployment group create \
            --resource-group "${{ vars.AZURE_RESOURCE_GROUP_NAME }}" \
            --template-file infra/azure/bicep/main.web.rg.bicep \
            --parameters @infra/azure/bicep/dev.bicepparam
```

## Setup Script Recommendation

Create a repo-specific setup script modeled on the `Nist.Nvd` script, but update it:

1. create or update GitHub environments:
   - `dev`
   - `qa`
   - `stg`
   - `prod`
2. create environment deployment identities
3. create federated credentials for each environment
4. create or update resource groups if needed
5. set repository variables
6. set environment variables
7. set environment secrets

Recommended script location:

- `tools/scripts/azure/setup-github-azure-environments.ps1`

The script should support two modes:

- `bootstrap-platform`
  - creates or updates persistent identities and environment metadata
- `sync-environments`
  - refreshes GitHub variables and environment values without rebuilding the whole platform

Recommended script responsibilities:

- create or update the persistent GitHub environments
- create or update persistent deployment identities
- create or update persistent subscriptions and resource groups only when needed
- avoid assuming daily re-creation of subscriptions
- prepare environment variables so workload deployments can be torn down and recreated independently

## Deployment Workflow Recommendation

### Web

Use separate reusable workflows:

- `deploy-web-dev.yml`
- `deploy-web-qa.yml`
- `deploy-web-stg.yml`
- `deploy-web-prod.yml`

Each should:

- reference the matching GitHub environment
- run Bicep validation or what-if
- deploy infrastructure
- deploy the web artifact
- run smoke checks

### Mobile

Use separate mobile workflows:

- `deploy-mobile-dev.yml`
- `deploy-mobile-qa.yml`
- `deploy-mobile-stg.yml`
- `deploy-mobile-prod.yml`

These should not share Azure deployment assumptions.

## Teardown Workflow Recommendation

Add a manual teardown workflow for non-production only:

- `teardown-nonprod.yml`

Recommended behavior:

- workflow dispatch only
- environment confirmation input
- use `Deployment Stacks`
- restrict to:
  - `dev`
  - `qa`
  - `stg`
- target workload resource groups or workload stacks
- do not delete subscriptions, management groups, or shared hub foundations

Do not automate production teardown.

## ADE Recommendation

Keep GitHub environments for the four persistent promotion environments.

If you add `Azure Deployment Environments` later, use it for:

- temporary preview environments
- demo environments
- sandbox environments

Do not replace the core GitHub environment model with ADE.

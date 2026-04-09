# GitHub And Azure Environments

This doc describes how GitHub environments, Azure deployment identities, and
Bicep parameters should work together for ACME LOS.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure governance and lifecycle](./azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Pipeline portability](./pipeline-portability.md)
- [Azure naming standard](../reference/azure-resource-naming-standard.md)
- [Release and delivery](./release-and-delivery.md)

## What We Have Today

The repo already has four GitHub deployment environments:

- `dev`
- `qa`
- `stg`
- `prod`

Important naming rule:

- there is no separate `test` environment
- `qa` is the shared validation environment for both QA and Okta/auth checks

Current observed state:

- all four environments exist already
- `qa`, `stg`, and `prod` already have required reviewer protection
- `dev` is open, which is appropriate for the first automation path

Recommended environment meaning:

- `dev`
  - shared development environment
  - points to Okta `dev`
- `qa`
  - shared validation environment
  - points to Okta `qa`
- `stg`
  - pre-production environment
  - can stay aligned to Okta `qa` at first or split later
- `prod`
  - production environment
  - points to Okta `prod`

Local runs are not a GitHub environment, but both apps should still show
`local` in the UI when running on a developer workstation.

The current Azure-specific helper script is:

- [tools/scripts/azure/setup-github-azure-environments.ps1](../../tools/scripts/azure/setup-github-azure-environments.ps1)

The referenced `Nist.Nvd` repo provided useful inspiration for the overall pattern:

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

One important refinement for this repo:

- the environment deployment identities now need both:
  - `Contributor`
  - `User Access Administrator`
- that is required because the deployment path creates role assignments for:
  - the container app's user-assigned managed identity to `AcrPull`
  - the same identity to `Key Vault Secrets User`
- each environment deployment identity also needs:
  - `Contributor`
  - on `rg-acme-hub-network-cus-01`
- that scope lets the workload deployment create and remove only its own
  platform-side private DNS virtual network links

## Recommended Variable And Secret Model

### Repository Variables

Use repository-level variables for non-secret values that are shared across the repo:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID_PLATFORM`
- `AZURE_SUBSCRIPTION_ID_NONPROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_LOCATION_PRIMARY`
- `PROJECT_NAME`
- `PROJECT_SHORT_NAME`
- `AZURE_ENVIRONMENTS`
- `AZURE_PLATFORM_NETWORK_RESOURCE_GROUP_NAME`
- `AZURE_PRIVATE_DNS_ZONE_KEY_VAULT`
- `AZURE_PRIVATE_DNS_ZONE_MANAGED_REDIS`

Optional:

- `AZURE_RESOURCE_NAME_PREFIX`
- `AZURE_PRIMARY_REGION_SHORT`
- `AZURE_PLATFORM_SUBSCRIPTION_NAME`
- `AZURE_NONPROD_SUBSCRIPTION_NAME`
- `AZURE_PROD_SUBSCRIPTION_NAME`

### Environment Variables

Use GitHub environment variables for non-secret values that differ by environment:

- `AZURE_CLIENT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP_NAME`
- `AZURE_ENVIRONMENT_NAME`
- `APP_ENVIRONMENT_NAME`
- `OKTA_ENVIRONMENT_NAME`
- `AZURE_DEPLOYMENT_STACK_NAME`
- `AZURE_IMAGES_SUBSCRIPTION_ROLE`
- `AZURE_IMAGES_RESOURCE_GROUP_NAME`
- `AZURE_CONTAINER_REGISTRY_NAME`
- `AZURE_CONTAINER_APPS_ENVIRONMENT_NAME`
- `AZURE_CONTAINER_APP_NAME`
- `AZURE_USER_ASSIGNED_IDENTITY_NAME`
- `AZURE_WORKLOAD_VNET_NAME`
- `AZURE_APP_SUBNET_NAME`
- `AZURE_DATA_SUBNET_NAME`
- `AZURE_ACA_INFRA_SUBNET_NAME`
- `AZURE_PRIVATE_ENDPOINT_SUBNET_NAME`
- `AZURE_KEY_VAULT_NAME`
- `AZURE_WEB_IMAGE_REPOSITORY`
- `AZURE_BICEP_PARAMETER_FILE`
- `AZURE_WEB_DEPLOY_TEMPLATE`

Recommendation:

- keep `APP_ENVIRONMENT_NAME` aligned to what the user should see in the UI:
  - `local`
  - `dev`
  - `qa`
  - `stg`
  - `prod`
- keep `OKTA_ENVIRONMENT_NAME` aligned to the backing Okta environment:
  - `dev` -> `dev`
  - `qa` -> `qa`
  - `stg` -> `qa`
  - `prod` -> `prod`
- use `AZURE_APP_SUBNET_NAME` and `AZURE_DATA_SUBNET_NAME` as the primary
  semantic names in docs and future pipeline work
- keep `AZURE_ACA_INFRA_SUBNET_NAME` and `AZURE_PRIVATE_ENDPOINT_SUBNET_NAME`
  only as compatibility aliases while older scripts converge

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
        shell: pwsh
        run: |
          ./tools/scripts/azure/deploy-web-environment.ps1 `
            -EnvironmentName 'dev' `
            -TenantId '${{ vars.AZURE_TENANT_ID }}' `
            -SubscriptionId '${{ vars.AZURE_SUBSCRIPTION_ID }}' `
            -Location '${{ vars.AZURE_LOCATION_PRIMARY }}' `
            -ParameterFile '${{ vars.AZURE_BICEP_PARAMETER_FILE }}'
```

## Setup Script Recommendation

The repo now has the first version of this script:

- [tools/scripts/azure/setup-github-azure-environments.ps1](../../tools/scripts/azure/setup-github-azure-environments.ps1)

And the script reads:

- [infra/azure/config/platform.json](../../infra/azure/config/platform.json)

The implementation is modeled on the `Nist.Nvd` script, but updated for this repo:

1. create or update GitHub environments:
   - `dev`
   - `qa`
   - `stg`
   - `prod`
2. create environment deployment identities
3. create federated credentials for each environment
4. set repository variables
5. set environment variables
6. grant each environment identity scoped access to the platform network RG for
   private DNS link management

Portability rule:

- keep this environment contract generic enough that Azure DevOps can supply the
  same values later
- the scripts should care about environment inputs, not whether GitHub or ADO
  passed them in

What it does **not** do today:

- create management groups
- create subscriptions
- create workload resource groups
- populate GitHub environment secrets
- create runtime application secrets in Key Vault

That is intentional. Governance bootstrap is a separate concern and now has its
own command path:

```powershell
npm run azure:show-governance
npm run azure:bootstrap:governance
```

The GitHub/Azure automation script should support two modes:

- `bootstrap-automation`
  - creates or updates persistent identities and environment metadata
- `sync-environments`
  - refreshes GitHub variables and environment values without rebuilding the whole platform

Recommended script responsibilities:

- create or update the persistent GitHub environments
- create or update persistent deployment identities
- avoid assuming daily re-creation of subscriptions
- prepare environment variables so workload deployments can be torn down and recreated independently
- resolve the named target subscriptions directly
- fail loudly if a required target subscription does not exist yet

Current commands:

```powershell
npm run azure:show-governance
npm run azure:bootstrap:governance
npm run azure:show-plan
npm run azure:bootstrap
npm run azure:sync-environments
```

## Deployment Workflow Recommendation

### Web

Use separate reusable workflows:

- `deploy-web-environment.yml`
- environment wrappers:
  - `deploy-dev.yml`
  - `deploy-qa.yml`
  - `deploy-stg.yml`
  - `deploy-prod.yml`

Each should:

- reference the matching GitHub environment
- run Bicep validation or what-if
- deploy infrastructure
- build and push the web image
- deploy the container app revision
- run smoke checks

### Mobile

Use separate mobile workflows:

- `deploy-mobile-dev.yml`
- `deploy-mobile-qa.yml`
- `deploy-mobile-stg.yml`
- `deploy-mobile-prod.yml`

These should not share Azure deployment assumptions.

## Teardown Workflow Recommendation

The repo should keep a manual teardown workflow for non-production only:

- `teardown-web-environment.yml`

Recommended behavior:

- workflow dispatch only
- environment confirmation input
- use the repo teardown script now
- keep `Deployment Stacks` as the current teardown authority for workload lifecycle
- restrict to:
  - `dev`
  - `qa`
  - `stg`

Current implementation now includes:

- `dev`
- `qa`
- `stg`
- `prod`

But `prod` teardown requires an explicit destructive confirmation input and
should be treated as an emergency-only path.

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

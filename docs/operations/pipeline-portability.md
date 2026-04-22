# Pipeline Portability

This repo currently uses GitHub Actions for delivery, but the deployment model
should stay portable enough that Azure DevOps can replace GitHub later without
rewriting the actual platform logic.

The rule is simple:

- GitHub Actions or Azure DevOps should orchestrate
- PowerShell scripts, Bicep, and repo config should own the deployment behavior

Related docs:

- [Release and delivery](./release-and-delivery.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Azure infrastructure scaffold](../../infra/azure/README.md)

## Portability Standard

Keep these layers separated:

1. `infra/azure/config/*`
   - naming
   - subscription layout
   - environment shape
2. `infra/azure/bicep/*`
   - Azure resource definitions
3. `tools/scripts/azure/*`
   - bootstrap
   - deploy
   - teardown
4. pipeline orchestrator
   - GitHub Actions today
   - Azure DevOps later if needed

If the orchestrator changes, the lower three layers should not need a redesign.

## What Must Stay Generic

The deployment scripts should accept generic inputs, not GitHub-specific ones.

Good examples:

- `EnvironmentName`
- `SubscriptionId`
- `TenantId`
- `Location`
- `ParameterFile`
- `ImageTag`

Bad examples:

- assumptions about `github.*` context inside the scripts
- GitHub-only environment naming baked into Bicep
- deploy behavior that depends on GitHub artifact formats

## Current Practical Model

Today:

- GitHub Actions handles approvals, workflow triggers, and OIDC login
- CD currently deploys `dev` automatically after successful main CI
- higher-environment web wrappers exist, but promotion beyond `dev` still needs
  an orchestrating workflow
- `deploy-web-environment.ps1` builds the web image, pushes it to ACR, deploys
  the workload stacks, and updates the ACA revision
- `teardown-web-environment.ps1` owns non-production teardown behavior
- Bicep owns the actual Azure resource definitions

That means the real deployment contract already lives in the repo, not in the
GitHub workflow YAML.

## Current GitHub Responsibilities

GitHub-specific responsibilities should stay thin:

- select the deployment environment
- authenticate to Azure with workload identity federation
- call the repo scripts
- summarize outputs
- gate promotion with approvals

That keeps the workflow files replaceable.

## Azure DevOps Equivalent

If Azure DevOps replaces GitHub later, the clean path is:

- use Azure DevOps service connections with workload identity federation
- keep the same `Bicep` files
- keep the same PowerShell scripts
- map ADO variables or variable groups to the same script inputs
- call the same deploy and teardown scripts from pipeline jobs

The important point is:

- swap the orchestrator
- do not rewrite the platform logic

## Environment Contract

The environment contract should stay platform-neutral.

That means every orchestrator should be able to provide:

- environment name
- target subscription id
- target tenant id
- target location
- Bicep parameter file
- image tag
- optional state-store mode override

Current web examples:

- `dev`
- `qa`
- `stg`
- `prod`

And both GitHub and Azure DevOps should drive the same exact contract.

## Identity Model

Preferred pattern:

- no long-lived Azure client secrets
- workload identity federation
- environment-scoped deployment identities

Current GitHub path:

- GitHub environment
- Entra app registration / service principal
- federated credential
- `azure/login@v2`

Equivalent Azure DevOps path:

- Azure Resource Manager service connection
- workload identity federation
- pipeline stage or environment scoped approvals

So the identity pattern is portable even if the CI/CD product changes.

## Artifact Strategy

Current state:

- the web deploy workflow downloads the build artifact for traceability
- the actual deploy script still builds and pushes the runtime image from the
  checked-out source ref

That is acceptable for now, but the important portability rule is:

- the pipeline should pass an image tag or a source ref
- the deploy script should remain the authority for how that becomes a live
  ACA revision

Later, if you want stricter promotion parity, you can evolve to:

- build once
- push one immutable image
- promote that image tag through `dev`, `qa`, `stg`, and `prod`

That evolution would still remain orchestrator-neutral.

## Validation Gate

Before pushing infrastructure or workflow changes, the repo should stay on the
same baseline:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

For Azure-focused changes, also validate the infra path you touched:

- `az bicep build` on changed entrypoints
- relevant bootstrap or deploy script parse checks
- targeted Azure deployment validation when needed

## What To Avoid

Avoid these portability traps:

- GitHub-only logic inside deployment scripts
- Azure portal steps that are not documented
- secrets that only exist in one CI/CD tool
- deployment behavior hidden inside workflow YAML instead of repo scripts
- rebuilding the environment contract differently for each orchestrator

## Recommendation

Keep using GitHub Actions as the current delivery plane.

But treat this as the architecture rule:

- GitHub is replaceable
- the deployment scripts and Bicep are not

That gives you the cleanest path if Azure DevOps ever becomes the preferred
orchestrator.

## Useful References

- Azure DevOps workload identity federation:
  - https://learn.microsoft.com/azure/devops/pipelines/release/configure-workload-identity
- Azure Resource Manager service connections:
  - https://learn.microsoft.com/azure/devops/pipelines/library/connect-to-azure
- GitHub OIDC with Azure:
  - https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect

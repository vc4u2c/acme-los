# Release And Delivery

This repo uses Nx Release plus GitHub Actions for CI/CD.

## Workflow Overview

- `.github/workflows/ci.yml`
  - runs on pull requests to `main` and pushes to `main`
  - validates tags, lint, tests, build artifacts, and app releases
- `.github/workflows/cd.yml`
  - runs after successful CI on `main`
  - promotes the built artifact through `dev`, `qa`, `stg`, and `prod`
- `.github/workflows/deploy-web-environment.yml`
  - reusable web deployment workflow called by the environment wrappers
- `.github/workflows/deploy-mobile.yml`
  - manual mobile deployment workflow
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-qa.yml`
- `.github/workflows/deploy-stg.yml`
- `.github/workflows/deploy-prod.yml`
  - environment-specific wrappers for the reusable web deployment workflow
- `.github/workflows/teardown-web-environment.yml`
  - manual non-production teardown workflow

Related docs:

- [GitHub and Azure environments](./github-azure-environments.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Pipeline portability](./pipeline-portability.md)

## Repository Setup Checklist

- enable GitHub Actions for the repository
- create GitHub environments named `dev`, `qa`, `stg`, and `prod`
- add required reviewers to `qa`, `stg`, and `prod` if promotions should pause for approval
- decide whether `main` branch protection needs a dedicated release token
- if it does, set `RELEASE_PUSH_TOKEN` as a repository secret
- keep the default `GITHUB_TOKEN` available for artifact download and workflow execution

Optional helper:

- `npm run azure:budget` creates or updates the monthly subscription budget guardrail
- `npm run azure:bootstrap:governance` creates or updates the management-group hierarchy and current subscription placement
- `npm run azure:bootstrap` uses [setup-github-azure-environments.ps1](../../tools/scripts/azure/setup-github-azure-environments.ps1) to scaffold or refresh the GitHub and Azure deployment environment contract once `gh` and `az` are authenticated

Environment naming rule:

- there is no separate `test` environment
- `qa` is the shared validation environment, including Okta/auth verification

Current Okta mapping:

- `local` -> Okta `dev`
- `dev` -> Okta `dev`
- `qa` -> Okta `qa`
- `stg` -> aligned to Okta `qa` at first or split later
- `prod` -> Okta `prod`

## Release Model

- `web-app` and `mobile-app` version independently
- internal shared libraries are not independently released
- app version sources of truth live in the app manifests

Current version sources:

- `apps/web-app/package.json`
- `apps/mobile-app/package.json`
- `apps/mobile-app/app.config.js`

Release commands:

```powershell
npm run release:dry-run
npm run release
```

## Delivery Model

Current reality is split by workload:

- CI validates lint and tests
- CI builds deployable artifacts and metadata
- CI performs app releases on `main`
- web deployment workflows authenticate to Azure and call the repo deploy script
- mobile deployment stays separate from Azure web deployment

Important nuance:

- the reusable web deploy workflow currently downloads the deploy artifact for
  traceability
- the actual web deployment still builds and pushes the runtime image from the
  checked-out source ref through
  [deploy-web-environment.ps1](../../tools/scripts/azure/deploy-web-environment.ps1)

So the current model is not yet “promote one prebuilt image unchanged through
every environment.” It is:

- validate once
- deploy through the same repo-owned script path
- keep the orchestrator thin

That is intentional because it keeps the deployment behavior owned by the repo
instead of buried inside GitHub-specific workflow logic.

## Orchestrator Boundary

GitHub Actions is the current orchestrator, not the source of truth for Azure
deployment behavior.

The stable layers are:

- `infra/azure/config/*`
- `infra/azure/bicep/*`
- `tools/scripts/azure/*`

GitHub Actions should stay responsible for:

- approvals
- environment selection
- Azure login
- calling the repo scripts
- publishing summaries

That keeps the path swappable with Azure DevOps later. See
[Pipeline portability](./pipeline-portability.md).

## Suggested Promotion Discipline

- keep feature branches short-lived
- run the full local verification sweep before promotion or workflow changes
- treat release commits as generated outputs, not working branches
- prefer one promotion branch per coherent slice instead of mixing unrelated cleanup and feature work

Current baseline:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

For Azure delivery changes, also add:

- relevant `az bicep build` checks
- PowerShell script parse checks
- targeted deploy validation where appropriate

## Environment Visibility

Both apps should expose the active environment in the UI.

Expected labels:

- local developer run: `local`
- deployed development: `dev`
- deployed validation: `qa`
- deployed staging: `stg`
- deployed production: `prod`

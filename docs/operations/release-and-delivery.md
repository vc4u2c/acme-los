# Release And Delivery

This repo uses Nx Release plus GitHub Actions for CI/CD.

## Workflow Overview

- `.github/workflows/ci.yml`
  - runs on pull requests to `main` and pushes to `main`
  - fails on moderate-or-higher npm or NuGet vulnerability findings
  - enables the BFF NuGet audit policy from `apps/bff-api/Directory.Build.props`
    only for the CI audit command
  - validates project tags, lint, and tests
  - on `main` pushes, also performs app release work and creates the deployable
    artifact
- `.github/workflows/cd.yml`
  - runs after successful CI on `main`
  - deploys `dev` automatically
- `.github/workflows/promote-web.yml`
  - provides the manual, one-click promotion demonstration
  - resolves an immutable artifact from a successful `main` CI run
  - deploys `dev` for real, then pauses at the `qa`, `stg`, and `prod` GitHub
    Environment approval gates
- `.github/workflows/deploy-web-environment.yml`
  - reusable web deployment workflow called by the environment wrappers
- `.github/workflows/deploy-mobile.yml`
  - manual mobile deployment workflow
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-qa.yml`
- `.github/workflows/deploy-stg.yml`
- `.github/workflows/deploy-prod.yml`
  - reusable, log-only promotion simulations for the higher environments
  - intentionally have no Azure identity permission, secrets, login, or deploy
    step
- `.github/workflows/teardown-web-environment.yml`
  - manual teardown workflow for non-production, with explicit destructive
    confirmation required for `prod`

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

- `web-app`, `mobile-app`, and `bff-api` version independently
- internal shared libraries are not independently released
- app version sources of truth live in the app manifests

Current version sources:

- `apps/web-app/package.json`
- `apps/mobile-app/package.json`
- `apps/mobile-app/app.config.js`
- `apps/bff-api/src/Acme.Los.Bff.Api/package.json`

Release commands:

```powershell
npm run release:dry-run
npm run release
```

## Delivery Model

Current reality is split by workload:

- CI validates affected projects with Nx
- CI builds project-prefixed deployable artifacts and metadata
- CI performs app releases on `main`
- CD deploys `dev` after successful main CI
- web deployment wrappers authenticate to Azure and call the repo deploy script
- mobile deployment stays separate from Azure web deployment

Current promotion status:

- `dev` is the automated post-main deployment
- `Promote Web` is a manually dispatched, chained promotion demonstration
- the `dev` stage performs a real deployment using the selected CI artifact
- `qa`, `stg`, and `prod` require their configured GitHub Environment approval,
  then record a simulation in the logs and job summary without changing Azure
- the higher-environment wrappers must be deliberately replaced with real
  deployment calls before those environments become deployment targets

## Manual Gated Promotion Demo

In GitHub Actions, select `Promote Web`, choose the `main` branch, and select
`Run workflow`. Leave `ci_run_id` blank for the normal one-click path; the
workflow selects the latest successful push-to-`main` CI run and verifies that
its deployable artifact is still available.

The workflow graph then shows this sequence:

1. resolve the successful CI run and immutable deployable artifact
1. deploy that artifact to Azure `dev` and run the live health check
1. wait for `qa` approval, then write a simulation-only promotion record
1. wait for `stg` approval, then write a simulation-only promotion record
1. wait for `prod` approval, then write a simulation-only promotion record

To replay a particular successful `main` CI artifact, enter its numeric Actions
run ID or use:

```powershell
gh workflow run promote-web.yml --ref main -f ci_run_id=<run-id>
```

Only the Dev job receives `id-token: write` and inherited environment secrets.
The QA, Staging, and Production jobs receive `contents: read` only and execute no
checkout, Azure login, infrastructure, or deployment action. Their purpose is to
demonstrate approval gates and immutable artifact progression safely.

Important nuance:

- the reusable web deploy workflow downloads the project-prefixed deploy artifact
  for traceability
- the actual web deployment builds and pushes the runtime image from the
  checked-out artifact source ref through
  [deploy-web-environment.ps1](../../tools/scripts/azure/deploy-web-environment.ps1)
- the `web-app` deployable currently includes the runtime-coupled BFF container
  because the browser-facing Next facade is still the public API boundary

So the current model is:

- validate once
- create a project-prefixed deployable artifact
- deploy through the same repo-owned script path
- keep the orchestrator thin

That is intentional because it keeps the deployment behavior owned by the repo
instead of buried inside GitHub-specific workflow logic.

## Nx-Based Promotion Strategy

Use Nx for project selection and release ownership, then promote immutable
project artifacts between environments.

Recommended steady state:

- `nx affected` decides which projects need validation for a PR or merge
- Nx Release owns independent project versions and GitHub releases
- deployable artifacts are prefixed by project name, for example
  `acme-los-web-app-deployable-<sha>` and
  `acme-los-web-app-<version>-release-bundle.tgz`
- BFF API release assets use `acme-los-bff-api-<version>-release-bundle.tgz`
  and GitHub releases are tagged as `bff-api@<version>`
- environment promotion passes the same artifact name, artifact run id, and
  artifact commit SHA to `dev`, `qa`, `stg`, and `prod`
- deployments never promote "whatever is on the branch"; they promote a
  recorded project artifact and its source SHA

Current project promotion units:

- `web-app`: deploys the public Next app and the internal BFF ACA together
- `bff-api`: versions and publishes a release record independently, while the
  runtime remains deployed with the web deployable until the BFF has a separate
  promotion lane
- `mobile-app`: releases separately through the mobile lane

The BFF now has its own Nx Release group because it owns real Okta
auth/session state. The deployable artifact still records both `webVersion` and
`bffVersion`; Azure receives the BFF semantic version through `ACME_BFF_VERSION`
and the source/image build SHA through `APP_BUILD_ID`.

The web deployable also carries the runtime-coupled BFF deployment. BFF ACA
scale follows the target environment runtime scale settings by default, with an
optional `bffRuntime` override if the BFF needs a different min/max replica
shape from the public web app or a BFF-specific feature flag such as
observability ingestion or Entra service auth.

When the BFF has independent consumers, split runtime promotion into
`acme-los-bff-api-deployable-*` artifacts. Until then, keep the web deployable
as the public app deploy unit and treat the BFF release as the API version
record carried inside that deploy unit.

Promotion smoke checks should validate the BFF-backed facade:

- `/api/health` reports a healthy BFF layer and `/security` reads the
  BFF-owned token/session snapshot in local/dev for real Okta auth
- when `bffRuntime.serviceAuth.mode=entra` is enabled, the same smoke path must
  prove that Next can acquire the BFF token and the BFF accepts only the allowed
  caller identity
- browser E2E uses its isolated BFF fixture; promotion still requires the real
  Okta and BFF path in the target environment

## Current Operating Reality

The healthiest steady state is:

- prove fixes locally when necessary
- merge them quickly
- let CI and CD become the durable deployment path again

Important rule:

- avoid leaving Azure environments ahead of `main` for long

If a local deploy proves an environment fix:

1. run the normal verification sweep
2. promote the change through the normal branch and PR path
3. let CD reproduce the same environment behavior from source control

That keeps the repo, the pipeline, and the live environment from drifting apart.

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
npm.cmd run audit:node
npm.cmd run dotnet:audit:ci
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

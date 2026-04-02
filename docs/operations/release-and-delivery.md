# Release And Delivery

This repo uses Nx Release plus GitHub Actions for CI/CD.

## Workflow Overview

- `.github/workflows/ci.yml`
  - runs on pull requests to `main` and pushes to `main`
  - validates tags, lint, tests, build artifacts, and app releases
- `.github/workflows/cd.yml`
  - runs after successful CI on `main`
  - promotes the built artifact through `dev`, `qa`, `stg`, and `prod`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-qa.yml`
- `.github/workflows/deploy-stg.yml`
- `.github/workflows/deploy-prod.yml`
  - reusable deployment workflows for each environment

## Repository Setup Checklist

- enable GitHub Actions for the repository
- create GitHub environments named `dev`, `qa`, `stg`, and `prod`
- add required reviewers to `qa`, `stg`, and `prod` if promotions should pause for approval
- decide whether `main` branch protection needs a dedicated release token
- if it does, set `RELEASE_PUSH_TOKEN` as a repository secret
- keep the default `GITHUB_TOKEN` available for artifact download and workflow execution

Optional helper:

- `tools/scripts/setup-github-environments.ps1` can scaffold or refresh the GitHub environments from the repo side once `gh` is authenticated

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

- CI validates lint and tests
- CI builds deployable artifacts
- CI performs app releases on `main`
- CD promotes the same built artifact through `dev`, `qa`, `stg`, and `prod`

## Suggested Promotion Discipline

- keep feature branches short-lived
- run the full local verification sweep before promotion
- treat release commits as generated outputs, not working branches
- prefer one promotion branch per coherent slice instead of mixing unrelated cleanup and feature work

## Environment Visibility

Both apps should expose the active environment in the UI.

Expected labels:

- local developer run: `local`
- deployed development: `dev`
- deployed validation: `qa`
- deployed staging: `stg`
- deployed production: `prod`

# ACME LOS

ACME LOS is an Nx monorepo for a loan-origination experience with:

- a Next.js web app
- an Expo / React Native mobile app
- shared auth, domain, API, config, and UI libraries
- Okta-hosted authentication with MFA and route-level step-up support
- Nx-based lint, test, e2e, release, and CI/CD automation

Current released app versions in source control:

- `web-app` `1.6.0`
- `mobile-app` `1.5.0`

## Quick Start

### Prerequisites

- Node.js `24.14.0`
- npm
- Windows PowerShell or a Unix-like shell

Install dependencies:

```powershell
npm install
```

### Run The Web App

```powershell
npx.cmd nx run web-app:dev
```

Open:

- `http://localhost:3000`

### Run The Mobile App

Start Expo:

```powershell
npx.cmd nx run mobile-app:start
```

Useful mobile targets:

```powershell
npx.cmd nx run mobile-app:serve
npx.cmd nx run mobile-app:run-android
npx.cmd nx run mobile-app:run-ios
```

### Run Verification

Lint and unit tests:

```powershell
npx.cmd nx run-many -t lint test --all
```

All e2e:

```powershell
npx.cmd nx run-many -t e2e --all
```

### When Auth Matters

If you are only working on public UI or shared libraries, the commands above are usually enough.

If you need any of these, complete the Okta setup below too:

- hosted sign-in or registration
- guarded `/apply/*` routes
- MFA and funding step-up flows
- customer dashboard and signed-in profile behavior

## Okta Setup

Use this root README for the short path and [infra/okta/README.md](./infra/okta/README.md) for the deeper admin-plane details.

### Local Dev Okta Checklist

1. Update the git-tracked manifests when auth intent changes:
   - `infra/okta/environments/dev.json`
   - `infra/okta/brand/acme-los.json`
2. Render local app config:

```powershell
npm run okta:render -- dev
```

3. Set a local Okta admin token:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
```

4. Bootstrap the dev Okta org:

```powershell
npm run okta:bootstrap -- dev
```

5. Restart the web app after client ID or issuer changes so `NEXT_PUBLIC_*` values are rebuilt into the browser bundle.

### Okta Command Summary

- `npm run okta:render -- dev`
  - generates local app config and machine-readable artifacts
- `npm run okta:bootstrap -- dev`
  - current working Okta write path for apps, policies, branding, hosted pages, and IDs
- `npm run okta:cleanup -- dev`
  - deletes the dev apps for a clean-room retest, clears stale IDs, and rerenders local config
- `npm run okta:terraform -- dev ...`
  - secondary path only; keep for future promotion work, not day-to-day setup

### Current Okta Reality

- hosted Okta sign-in is the primary sign-in and registration path
- there is no separate local create-account flow anymore
- bootstrap is the working admin-plane path today
- Terraform still exists, but it is not the main local provisioning path
- funding step-up remains an application-runtime concern on top of the Okta baseline

## GitHub Setup

The repo already includes the GitHub Actions workflows. A fresh GitHub repo mostly needs Actions enabled, environments present, and one optional release secret if branch protection needs a dedicated release token.

### Workflow Overview

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

### Repository Setup Checklist

- enable GitHub Actions for the repository
- create GitHub environments named `dev`, `qa`, `stg`, and `prod`
- add required reviewers to `qa`, `stg`, and `prod` if promotions should pause for approval
- decide whether `main` branch protection needs a dedicated release token
- if it does, set `RELEASE_PUSH_TOKEN` as a repository secret
- keep the default `GITHUB_TOKEN` available for artifact download and workflow execution

Optional helper:

- `tools/scripts/setup-github-environments.ps1` can scaffold or refresh the GitHub environments from the repo side once `gh` is authenticated

### Release And Promotion Shape

- pushes to `main` run CI and build a deployable artifact bundle
- releases are created from `main` with independent `web-app` and `mobile-app` version bumps
- CD promotes the same built artifact from `dev` to `qa` to `stg` to `prod`
- release metadata is bundled with the artifact so version/source information stays attached to promotions

## Current Product State

### Web

- public marketing and support routes
- guarded seven-step application flow under `/apply/[step]`
- customer dashboard under `/account/profile`
- hosted Okta sign-in and registration
- route-level funding step-up for stronger verification

### Mobile

- Expo app shell aligned to the web visual direction
- dashboard-oriented home experience
- shared release/version wiring through app config
- auth-ready structure for future Okta mobile integration

### Shared Platform

- shared auth contracts, core helpers, and web adapter under `libs/auth/*`
- shared domain and API contracts under `libs/domain/*` and `libs/api/*`
- shared UI libraries for web and mobile under `libs/ui/*`
- release automation and GitHub deployment pipeline already wired

## Repository Highlights

Major milestones from the current commit history, grouped by what matters now:

- repository and Nx foundation
  - Nx workspace bootstrap
  - shared apps/libs structure
  - Husky, commitlint, lint-staged, and tag validation
- shared platform model
  - domain, API, config, logger, and utility libraries
  - web and mobile shared UI foundations
- product shell evolution
  - redesigned web shell
  - multi-step apply flow
  - customer dashboard and guarded application routes
- release and delivery
  - independent app versioning with Nx Release
  - CI artifact build and gated CD promotion flow
- modernization and hardening
  - Expo 55 alignment
  - dependency refreshes
  - accessibility and e2e coverage improvements
- auth and hosted experience
  - shared auth library structure
  - Okta bootstrap/render/cleanup scripts
  - hosted Okta branding and customer auth flow

## Workspace Layout

```text
acme-los/
  apps/
    web-app/
    web-app-e2e/
    mobile-app/
    mobile-app-e2e/
  docs/
    architecture/
  infra/
    okta/
  libs/
    api/
    auth/
    core/
    domain/
    ui/
  tools/
  package.json
  package-lock.json
  nx.json
  tsconfig.base.json
```

Primary applications:

- `apps/web-app`
- `apps/web-app-e2e`
- `apps/mobile-app`
- `apps/mobile-app-e2e`

Primary shared areas:

- `libs/auth/contracts`
- `libs/auth/core`
- `libs/auth/web`
- `libs/core/*`
- `libs/domain/*`
- `libs/api/*`
- `libs/ui/web`
- `libs/ui/mobile`

## Auth And Okta

### Current Auth Shape

- public product entry points send users into the application flow
- signed-out profile entry goes to hosted Okta sign-in
- hosted Okta sign-in is also the registration path
- there is no separate local create-account page anymore
- signed-in profile entry goes to the customer dashboard
- funding uses stronger route-level auth requirements than the rest of the application

### MFA Model

Current intended behavior:

- registration requires password plus email enrollment
- standard sign-in is password-first
- adaptive sign-in can step up to 2FA on high-risk access
- funding route access is step-up protected in application runtime with `acr_values`

### Local Okta Flow

Git-tracked source of truth:

- `infra/okta/environments/dev.json`
- `infra/okta/environments/qa.json`
- `infra/okta/environments/stg.json`
- `infra/okta/environments/prod.json`
- `infra/okta/brand/acme-los.json`

Render local config:

```powershell
npm run okta:render -- dev
```

Bootstrap the dev Okta org:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:bootstrap -- dev
```

Clean-room reset of the dev Okta apps:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:cleanup -- dev
npm run okta:bootstrap -- dev
```

Important note:

- MJS scripts are the real working Okta write path today
- Terraform is still present, but it is not the primary provisioning path yet

Read these docs for the deeper Okta setup story:

- [infra/okta/README.md](./infra/okta/README.md)
- [infra/okta/terraform/README.md](./infra/okta/terraform/README.md)

## Architecture

### Dependency Direction

Recommended direction:

- apps can depend on libs
- `ui` can depend on `core`, `domain`, and auth contracts where needed
- `api` can depend on `core` and `domain`
- `domain` can depend on `core`
- `core` should stay app-agnostic

Avoid:

- web importing mobile UI
- mobile importing web UI
- domain logic depending on app code
- deep relative imports across projects

Use package imports such as:

- `@acme-los/domain/loan`
- `@acme-los/api/contracts`
- `@acme-los/auth/web`
- `@acme-los/ui-web`

### State Management Direction

- TanStack Form for form state
- TanStack Query for server-state and BFF/API data
- focused auth provider for session and route protection

### BFF Direction

The web app is being shaped so browser PKCE can later move behind a .NET BFF without rewriting the UI layer.

Planned BFF endpoints:

- `GET /bff/auth/login`
- `GET /bff/auth/callback`
- `POST /bff/auth/logout`
- `GET /bff/auth/session`

Related docs:

- [docs/architecture/domain-boundaries.md](./docs/architecture/domain-boundaries.md)
- [docs/architecture/auth-and-api-contracts.md](./docs/architecture/auth-and-api-contracts.md)

## Common Commands

### Web

```powershell
npx.cmd nx run web-app:dev
npx.cmd nx run web-app:build
npx.cmd nx run web-app:lint
npx.cmd nx run web-app:test
npx.cmd nx run web-app-e2e:e2e
```

### Mobile

```powershell
npx.cmd nx run mobile-app:start
npx.cmd nx run mobile-app:serve
npx.cmd nx run mobile-app:run-android
npx.cmd nx run mobile-app:run-ios
npx.cmd nx run mobile-app:lint
npx.cmd nx run mobile-app:test --runInBand
npx.cmd nx run mobile-app-e2e:e2e
```

### Workspace-Wide

```powershell
npx.cmd nx run-many -t lint
npx.cmd nx run-many -t test
npx.cmd nx run-many -t e2e
npx.cmd nx graph
npm run validate:tags
```

Windows note:

- `npx.cmd nx ...` is safer than plain `npx nx ...` in this repo on Windows

## Release And Delivery

Release model:

- independent app versioning for `web-app` and `mobile-app`
- internal shared libraries are not independently released
- version source of truth lives in each app manifest

Current version sources:

- `apps/web-app/package.json`
- `apps/mobile-app/package.json`
- `apps/mobile-app/app.config.js`

Release commands:

```powershell
npm run release:dry-run
npm run release
```

Current delivery model:

- CI validates lint and tests
- CI builds deployable artifacts
- CI performs app releases on `main`
- CD promotes the built artifact through `dev`, `qa`, `stg`, and `prod`

## Tooling And UI Stack

### Web

- Next.js App Router
- Tailwind CSS
- shadcn-style component direction
- Radix primitives

### Mobile

- Expo
- React Native
- NativeWind
- Gluestack

### Shared UI Guidance

- share tokens, contracts, and intent across platforms
- keep rendered web and mobile components separate
- do not force direct cross-platform component reuse above the shared-contract layer

## Development Notes

- package manager is `npm`
- this workspace uses `nx.json`, not legacy `workspace.json`
- `apps/web-app/next-env.d.ts` is auto-generated by Next.js
- mobile e2e is Playwright against Expo Web, not Detox
- `tools/scripts/validate-project-tags.mjs` enforces project tag usage

## Git Hooks And Commit Format

Husky hooks in this repo:

- `.husky/pre-commit`
- `.husky/commit-msg`

Commit format:

```text
type(scope): subject
```

Examples:

```text
feat(web-app): add borrower dashboard shell
feat(auth): wire okta hosted callback handling
docs(readme): reorganize quick-start flow
chore(repo): refresh dependency policy
```

## Suggested Next Steps

- finish moving generic web icons to `lucide-react` where it is worth the swap
- back customer profile persistence with the future BFF instead of local browser storage
- continue reducing overlap between MJS and Terraform in the Okta admin plane
- expand shared query/data access patterns as the BFF solidifies

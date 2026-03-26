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

### Recommended Transition Plan

Recommended near-term path:

- keep the current apply route shape
  - server-rendered route shells
  - small client form islands
- add a thin Next.js API layer for web-only cookie/session handling and proxy behavior
- keep UI code calling app-owned API contracts instead of reaching directly into auth/storage details
- move security hardening into that API layer first
  - secure cookie boundaries
  - CSRF protection where needed
  - server-side session checks
  - token handling off the browser
- treat the Next API layer as a temporary web façade, not the final business-logic home
- preserve request/response contracts so the later .NET BFF can replace the Next implementation with minimal UI churn

Practical implication:

Current first slice now in place:

- `/apply/*` keeps the same route shape with server-rendered shells and client form islands
- `apps/web-app/src/app/api/auth/session`
  - syncs verified Okta sign-in into a web-owned HTTP-only session cookie
  - gives the web shell a server-backed session read path
- `apps/web-app/src/app/api/security/csrf`
  - issues CSRF tokens for mutating web facade requests
- `apps/web-app/src/app/api/customer/profile`
  - moves customer dashboard profile persistence behind the facade instead of local browser storage
- `apps/web-app/src/app/api/application/*`
  - keeps the current seven-step application flow behind the facade
  - stores in-progress application state in a secure web-session boundary instead of browser-local application storage

This is intentionally still a temporary web-only facade:

- it owns cookie/session concerns and light request validation
- it does not become the long-term business-logic home
- the future .NET BFF should be able to replace these implementations while keeping the request and response shapes stable

- web can use the Next API layer now for cookie-backed auth/session work
- mobile should continue to depend on shared contracts, not Next-specific runtime details
- when the .NET BFF is ready, the web app should mostly swap transport/proxy wiring rather than rewrite page and form code

Current API boundary split:

- `libs/api/contracts`
  - app-owned request and response shapes for `auth`, `customer`, and `application`
- `libs/api/web-client`
  - browser-safe wrappers that call the web app's own `/api/*` routes
  - handles CSRF-aware requests without exposing Okta or cookie internals to UI code
- `libs/api/domain-client`
  - server-side wrappers for domain-facing `customer` and `application` endpoints
  - this is the layer the Next facade can later point at a .NET BFF or legacy services through

### Implementation Checklist

Use this as the practical execution order for the next auth, API, and hardening phase.

#### Phase 1: Freeze The Current Auth Slice

- keep the current `/apply/*` route shape
- keep server-rendered route shells
- keep client form islands focused on interaction only
- keep the web app using the server-backed auth session cookie as the source of truth
- keep hosted Okta focused on sign-in, MFA, reset, and unlock flows

Definition of done:

- callback creates the secure web session reliably
- guarded routes use server-side session checks
- sign-out clears both the app session and the Okta browser session

#### Phase 2: Expand The Thin Next API Layer

- add or continue expanding route handlers under `apps/web-app/src/app/api/*`
- keep those handlers limited to:
  - cookie and session handling
  - CSRF validation
  - auth and assurance enforcement
  - request and response mapping
  - proxy behavior
- do not move long-term business logic into the Next route handlers

Definition of done:

- web UI talks to app-owned API contracts only
- UI no longer reaches into Okta browser storage or cookie details directly
- the same request and response shapes can later be implemented by the .NET BFF

#### Phase 3: Move Remaining Protected Web Actions Behind The Facade

- move authenticated customer and profile actions behind `/api/*`
- move any remaining web-only auth mutations behind `/api/*`
- keep shared contracts in `libs/api/contracts`
- keep browser wrappers in `libs/api/web-client`
- keep server-side customer and application wrappers in `libs/api/domain-client`

Definition of done:

- web pages and components depend on shared contracts and the web client wrapper
- auth, session, and profile changes are mediated by the server layer

#### Phase 4: Replace Temporary Persistence

- replace cookie-backed demo persistence for customer profile data
- replace temporary session-scoped application flow storage with backend persistence
- replace other web-only protected state assumptions where appropriate

Definition of done:

- protected customer data lives in backend persistence
- customer profile and application progress are no longer stored in temporary web-only persistence

#### Phase 5: Security Hardening Pass

- review secure cookie settings across environments
- review CSRF coverage on all mutating web routes
- add rate limiting or abuse controls where needed
- add audit and security logging for sign-in, sign-out, and sensitive actions
- review env var and secret handling for production readiness
- review server-side assurance checks for standard and funding routes

Definition of done:

- the web facade has explicit hardening around cookies, CSRF, and sensitive actions
- there is a clear audit trail for auth-sensitive events

#### Phase 6: Prepare The .NET BFF Swap

- keep request and response contracts stable in `libs/api/contracts`
- keep the web client calling app-owned endpoints, not Okta internals
- keep the Next implementation thin enough that it can later proxy to or be replaced by .NET
- avoid baking Next-specific auth or session assumptions into shared UI or domain code

Definition of done:

- the .NET BFF can replace the Next implementation with minimal UI churn
- mobile and web can share contracts without inheriting web-only runtime details

#### Phase 7: Registration Rework When Unpaused

- stop relying on hosted Okta self-service registration as the final customer registration model
- build app-owned registration flow behind the server API layer
- keep temporary registration state in backend persistence
- create the Okta user only at the end of successful registration
- create the Okta user as `STAGED`
- include `leadId` and `customerId` in the final user creation path

Definition of done:

- partial registration does not leave behind real customer users in Okta
- hosted Okta stays focused on sign-in, MFA, reset, and unlock

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

- harden the web auth path behind a thin Next API layer before the .NET BFF exists
- define stable request/response contracts so the later .NET BFF can replace the Next API layer without UI churn
- replace the temporary web-session application flow store with backend persistence when the BFF arrives
- finish moving generic web icons to `lucide-react` where it is worth the swap
- back customer profile persistence with the future BFF instead of local browser storage
- continue reducing overlap between MJS and Terraform in the Okta admin plane
- expand shared query/data access patterns as the BFF solidifies

# ACME LOS

Nx monorepo backbone for a Loan Origination System.

## Purpose

This repository is the starting point for an LOS codebase with:

- a web application in Next.js
- a mobile application in Expo and React Native
- shared domain, api, core, and UI libraries under `libs/`
- Nx-based orchestration for build, test, lint, and dependency management

The repo is currently in an early foundation stage. The shared libraries exist as the initial backbone, and the platform styling stack is being established so web and mobile can evolve with clear boundaries.

## Current Repository State

Current applications:

- `apps/web-app` - Next.js application
- `apps/web-app-e2e` - Playwright e2e coverage for the web app
- `apps/mobile-app` - Expo React Native application
- `apps/mobile-app-e2e` - Playwright coverage for Expo Web

Current libraries:

- `libs/core/types`
- `libs/core/utils`
- `libs/core/config`
- `libs/core/logger`
- `libs/domain/loan`
- `libs/domain/borrower`
- `libs/domain/application`
- `libs/domain/underwriting`
- `libs/api/client`
- `libs/api/contracts`
- `libs/ui/web`
- `libs/ui/mobile`

Package manager:

- `npm`

Runtime baseline:

- Node.js 24 LTS

## Repository History

Current commit history in this repository:

1. `65a0248` `Initial commit`
2. `46d5410` `feat(repo): bootstrap Nx apps, hooks, and docs`
3. `e22e1fd` `chore(repo): remove husky deprecation warning`
4. `fa3a7c6` `feat(repo): add shared libs and tailwind setup`
5. `166f045` `feat(repo): add shared ui foundations and los models`
6. `68fbdf0` `feat(web): add shadcn foundation and install docs`

What those commits established:

- the Nx workspace
- the Next.js and Expo applications
- Jest and Playwright coverage
- Husky and commitlint
- the initial shared library skeleton
- web Tailwind setup

Those later commits added:

- mobile NativeWind wiring
- gluestack provider setup for mobile
- the first shared mobile button primitive
- move of mobile shared UI into `libs/ui/mobile`
- shadcn-ready web UI foundation under `libs/ui/web`
- concrete domain models and API DTOs in the generated shared libraries
- project tag validation for future apps and libs

## Repo-Specific Ground Rules

This repository does not use generic sample names from older Nx or tutorial examples.

Use these values in this repo:

- workspace name: `acme-los`
- package manager: `npm`
- web app: `web-app`
- mobile app: `mobile-app`

Not used here:

- `pnpm`
- `yarn`
- `los-monorepo`
- `los-web`
- `los-mobile`

Other repo-specific notes:

- this workspace uses `nx.json`, not an older `workspace.json`
- the Next.js app uses Jest, not Vitest
- mobile e2e is Playwright against Expo Web, not native-device Detox
- on Windows, `npx.cmd nx ...` or `node .\node_modules\nx\bin\nx.js ...` is safer than plain `npx`

## Naming Conventions

Recommended naming in this repository:

- workspace/repo: `acme-los`
- web app: `web-app`
- mobile app: `mobile-app`
- package scope: `@acme-los/*`

General conventions:

- apps and files: `kebab-case`
- variables and functions: `camelCase`
- types and interfaces: `PascalCase`
- constants: `UPPER_SNAKE_CASE`

Examples:

- `@acme-los/core/types`
- `@acme-los/domain/loan`
- `@acme-los/api/contracts`
- `@acme-los/ui-web`
- `@acme-los/ui-mobile`

## Workspace Layout

This workspace uses the standard Nx `apps/` and `libs/` layout.

```text
acme-los/
  apps/
    web-app/
    web-app-e2e/
    mobile-app/
    mobile-app-e2e/
  libs/
    api/
    core/
    domain/
    ui/
  docs/
  tools/
  package.json
  package-lock.json
  nx.json
  tsconfig.base.json
```

## Prerequisites

- Node.js 24 LTS
- npm
- VS Code recommended

Recommended VS Code extensions:

- Nx Console
- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- GitLens
- EditorConfig for VS Code
- Expo Tools

## Environment Verification

Verify the local toolchain:

```powershell
node -v
npm -v
node .\node_modules\nx\bin\nx.js --version
```

If you use `nvm-windows`, a valid Node 24 flow is:

```powershell
nvm install 24.14.0
nvm use 24.14.0
node -v
```

## Install Dependencies

```powershell
npm install
```

## Installation History And Commands

This section captures the major installation steps and package additions that shaped the current workspace.

These commands are split into two categories:

- historical bootstrap commands that explain how this repo was originally formed
- additive install commands that are relevant to the current architecture

Do not rerun the bootstrap commands inside this existing repository. They are documented for traceability, not as repeatable in-place setup steps.

### Historical Bootstrap Commands

Representative bootstrap flow for this workspace shape:

```powershell
npx create-nx-workspace@latest acme-los
```

Representative follow-on generation flow for the app structure now present in git history:

```powershell
npx.cmd nx g @nx/next:app web-app
npx.cmd nx g @nx/expo:app mobile-app
npx.cmd nx g @nx/js:lib libs/core/types
npx.cmd nx g @nx/js:lib libs/core/utils
npx.cmd nx g @nx/js:lib libs/core/config
npx.cmd nx g @nx/js:lib libs/core/logger
npx.cmd nx g @nx/js:lib libs/domain/loan
npx.cmd nx g @nx/js:lib libs/domain/borrower
npx.cmd nx g @nx/js:lib libs/domain/application
npx.cmd nx g @nx/js:lib libs/domain/underwriting
npx.cmd nx g @nx/js:lib libs/api/client
npx.cmd nx g @nx/js:lib libs/api/contracts
npx.cmd nx g @nx/react:lib libs/ui/web
npx.cmd nx g @nx/react:lib libs/ui/mobile
```

Those commands are documented to show repo lineage. They are not intended to be rerun in this workspace now that the projects already exist.

### Current Additive Install Commands

Core install:

```powershell
npm install
```

Mobile NativeWind and React Native styling setup:

```powershell
npx.cmd expo install nativewind react-native-reanimated react-native-safe-area-context
```

Mobile gluestack foundation and component dependencies:

```powershell
npm.cmd install @gluestack-ui/nativewind-utils @gluestack-ui/overlay @gluestack-ui/toast
npm.cmd install @gluestack-ui/core@^3.0.13 @gluestack-ui/utils@^3.0.15 --legacy-peer-deps
npm.cmd install react-native-worklets@0.5.1 --legacy-peer-deps
```

Web shadcn-compatible foundation dependencies:

```powershell
npm.cmd install class-variance-authority clsx tailwind-merge --legacy-peer-deps
npm.cmd install -D shadcn
npm.cmd install @radix-ui/react-slot --legacy-peer-deps
```

Nx Release setup for independent app versioning:

```powershell
npx.cmd nx release --dry-run --skip-publish
```

Tag validation and governance:

```powershell
npm run validate:tags
```

### Current Installed Tooling Of Note

Web-side UI foundation packages:

- `shadcn`
- `@radix-ui/react-slot`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`

Mobile-side UI foundation packages:

- `nativewind`
- `@gluestack-ui/core`
- `@gluestack-ui/utils`
- `@gluestack-ui/nativewind-utils`
- `@gluestack-ui/overlay`
- `@gluestack-ui/toast`
- `react-native-worklets`

## Day-One Commands

Preferred on Windows PowerShell:

```powershell
npx.cmd nx <target> <project>
```

Equivalent direct Node form:

```powershell
node .\node_modules\nx\bin\nx.js run <project>:<target>
```

Useful examples:

```powershell
npx.cmd nx run web-app:dev
npx.cmd nx run mobile-app:start
npx.cmd nx run-many -t test
npx.cmd nx graph
```

## Architecture Overview

The workspace is organized around platform apps consuming shared libraries.

Recommended dependency direction:

- apps can depend on libs
- `ui` can depend on `core` and `domain`
- `api` can depend on `core` and `domain`
- `domain` can depend on `core`
- `core` should stay app-agnostic

Avoid:

- web importing mobile UI
- mobile importing web UI
- domain code depending on app code
- deep relative imports across projects

Prefer package imports such as:

- `@acme-los/domain/loan`
- `@acme-los/api/contracts`
- `@acme-los/ui-mobile`

Architecture references:

- [Domain Boundaries](c:/Users/vc4u2/Documents/Source/Repos/acme-los/docs/architecture/domain-boundaries.md)
- [Auth and API Contracts](c:/Users/vc4u2/Documents/Source/Repos/acme-los/docs/architecture/auth-and-api-contracts.md)

## Styling And UI Strategy

The intended platform split is:

- Web: Tailwind CSS in `apps/web-app`, with `shadcn/ui` as the target component system
- Mobile: NativeWind in `apps/mobile-app`, with gluestack as the target component system

What is wired now:

- web Tailwind is active in `apps/web-app`
- shadcn-style button and `cn()` foundation now live in `libs/ui/web`
- mobile NativeWind is active in `apps/mobile-app`
- mobile gluestack foundation is active through `GluestackUIProvider`
- mobile shared UI primitives now live in `libs/ui/mobile`

What should be shared across platforms:

- domain logic
- API contracts and clients
- validation
- theme tokens where practical
- variant names and intent

What should remain platform-specific:

- rendered web components
- rendered mobile components
- DOM-only behavior
- React Native-only behavior

Do not plan around direct component reuse between `shadcn/ui` and gluestack. Reuse should happen below the rendered component layer.

## Web Application

Current web styling files:

- `apps/web-app/tailwind.config.js`
- `apps/web-app/postcss.config.js`
- `apps/web-app/src/app/global.css`
- `libs/ui/web/src/lib/button.tsx`
- `libs/ui/web/src/lib/utils.ts`

Current web direction:

- Next.js app router
- Tailwind-based styling
- shadcn-ready shared foundation under `@acme-los/ui-web`
- semantic version is stored in `apps/web-app/package.json`

Common commands:

Run app:

```powershell
npx.cmd nx run web-app:dev
node .\node_modules\nx\bin\nx.js run web-app:dev
```

Build app:

```powershell
npx.cmd nx run web-app:build
node .\node_modules\nx\bin\nx.js run web-app:build
```

Lint app:

```powershell
npx.cmd nx run web-app:lint
node .\node_modules\nx\bin\nx.js run web-app:lint
```

Test app:

```powershell
npx.cmd nx run web-app:test
node .\node_modules\nx\bin\nx.js run web-app:test
```

Run e2e:

```powershell
npx.cmd nx run web-app-e2e:e2e
node .\node_modules\nx\bin\nx.js run web-app-e2e:e2e
```

Show project details:

```powershell
npx.cmd nx show project web-app --web
```

## Mobile Application

Current mobile styling files:

- `apps/mobile-app/tailwind.config.js`
- `apps/mobile-app/global.css`
- `apps/mobile-app/nativewind-env.d.ts`
- `apps/mobile-app/metro.config.js`
- `apps/mobile-app/.babelrc.js`
- `apps/mobile-app/app.config.js`

Current shared mobile UI files:

- `libs/ui/mobile/src/lib/gluestack-ui-provider/index.tsx`
- `libs/ui/mobile/src/lib/button/index.tsx`

Current mobile direction:

- Expo
- React Native
- NativeWind
- gluestack provider and button primitive from `@acme-los/ui-mobile`
- semantic version is stored in `apps/mobile-app/package.json` and read by Expo through `apps/mobile-app/app.config.js`

Common commands:

Run app in Expo dev server:

```powershell
npx.cmd nx run mobile-app:start
node .\node_modules\nx\bin\nx.js run mobile-app:start
```

Run app in browser:

```powershell
npx.cmd nx run mobile-app:serve
node .\node_modules\nx\bin\nx.js run mobile-app:serve
```

Run app on Android:

```powershell
npx.cmd nx run mobile-app:run-android
node .\node_modules\nx\bin\nx.js run mobile-app:run-android
```

Run app on iOS:

```powershell
npx.cmd nx run mobile-app:run-ios
node .\node_modules\nx\bin\nx.js run mobile-app:run-ios
```

Lint app:

```powershell
npx.cmd nx run mobile-app:lint
node .\node_modules\nx\bin\nx.js run mobile-app:lint
```

Test app:

```powershell
npx.cmd nx run mobile-app:test --runInBand
node .\node_modules\nx\bin\nx.js run mobile-app:test --runInBand
```

Run e2e:

```powershell
npx.cmd nx run mobile-app-e2e:e2e
node .\node_modules\nx\bin\nx.js run mobile-app-e2e:e2e
```

Verified during the latest setup pass:

- `nx test mobile-app --runInBand`
- `nx lint mobile-app`

## Shared Libraries

Current structure:

```text
libs/
  core/
    types/
    utils/
    config/
    logger/
  domain/
    loan/
    borrower/
    application/
    underwriting/
  api/
    client/
    contracts/
  ui/
    web/
    mobile/
```

Recommended import paths:

- `@acme-los/core/types`
- `@acme-los/core/utils`
- `@acme-los/core/config`
- `@acme-los/core/logger`
- `@acme-los/domain/loan`
- `@acme-los/domain/borrower`
- `@acme-los/domain/application`
- `@acme-los/domain/underwriting`
- `@acme-los/api/client`
- `@acme-los/api/contracts`
- `@acme-los/ui-web`
- `@acme-los/ui-mobile`

Current exports from `@acme-los/ui-mobile`:

- `GluestackUIProvider`
- `Button`
- `ButtonText`
- `ButtonSpinner`
- `ButtonIcon`
- `ButtonGroup`

Current exports from `@acme-los/ui-web`:

- `Button`
- `buttonVariants`
- `cn`

Concrete shared models and DTOs now live in:

- `libs/core/types`
- `libs/core/utils`
- `libs/core/config`
- `libs/core/logger`
- `libs/domain/borrower`
- `libs/domain/loan`
- `libs/domain/application`
- `libs/domain/underwriting`
- `libs/api/contracts`
- `libs/api/client`

## Testing Setup

Web:

- app framework: Next.js
- unit tests: Jest
- e2e: Playwright

Mobile:

- app framework: Expo
- unit tests: Jest
- e2e: Playwright against Expo Web

Important note:

- `mobile-app-e2e` is not native-device Detox coverage
- it is browser-based e2e for the Expo app rendered on web with mobile device profiles

## Workspace-Wide Commands

Lint everything:

```powershell
npx.cmd nx run-many -t lint
node .\node_modules\nx\bin\nx.js run-many -t lint
```

Test everything:

```powershell
npx.cmd nx run-many -t test
node .\node_modules\nx\bin\nx.js run-many -t test
```

Run all e2e:

```powershell
npx.cmd nx run-many -t e2e
node .\node_modules\nx\bin\nx.js run-many -t e2e
```

Inspect dependency graph:

```powershell
npx.cmd nx graph
node .\node_modules\nx\bin\nx.js graph
```

Validate project tags:

```powershell
npm run validate:tags
```

## GitHub Integration

This repository now includes first-party GitHub automation under `.github/`.

Current workflows:

- `CI` runs on pull requests targeting `main` and on pushes to `main`
- `Commitlint` runs on pull requests and validates commit messages across the PR range
- `CI` also performs application release automation on pushes to `main`
- `CD` is the top-level deployment workflow
- `CD` builds one deployable artifact after successful `CI` on `main`
- `CD` automatically deploys that artifact to `dev`
- `CD` also handles manual promotion of that same artifact to `qa`, `stg`, or `prod`
- the environment-specific deploy files remain separate reusable workflows called by `CD`

Current GitHub checks:

- `CI / Lint And Test`
- `Commitlint / Validate PR Commits`
- `CI / Release Apps`
- `CD / Build Release Artifact`
- `CD / Deploy To Dev`
- `CD / Deploy To QA`
- `CD / Deploy To Staging`
- `CD / Deploy To Production`

Current GitHub files:

- `.github/workflows/ci.yml`
- `.github/workflows/commitlint.yml`
- `.github/workflows/cd.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-qa.yml`
- `.github/workflows/deploy-stg.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/pull_request_template.md`

Recommended repository settings:

- require the `CI / Lint And Test` check before merging to `main`
- require the `Commitlint / Validate PR Commits` check before merging to `main`
- allow the GitHub Actions release job to bypass direct-push restrictions on `main`, or allow GitHub Actions to push release commits to `main`
- keep GitHub Actions enabled for the repository
- allow the default `GITHUB_TOKEN` to create tags and releases for the release workflow
- create GitHub environments named `dev`, `qa`, `stg`, and `prod`
- configure required reviewers on the `prod` environment so production deployment is gated

GitHub updates to make now:

1. Go to `Settings -> Branches -> main` protection rule.
2. Under required status checks, remove the old `verify` check if it is still listed.
3. Add these required checks:

- `CI / Lint And Test`
- `Commitlint / Validate PR Commits`

4. Allow GitHub Actions to push the release commit to `main` for the automated release step.
5. Keep pull request merging required for `main` for human changes.
6. Go to `Settings -> Actions -> General`.
7. Set `Workflow permissions` to `Read and write permissions`.
8. Go to `Settings -> Environments` and create:

- `dev`
- `qa`
- `stg`
- `prod`

9. On the `prod` environment, add required reviewers so production deployment is gated.

How the GitHub process works end to end:

1. Local development

- Husky `commit-msg` runs local commitlint when you make a commit
- Husky `pre-commit` runs `lint-staged` and project tag validation
- Husky `pre-commit` blocks direct commits on `main` unless `ALLOW_MAIN_COMMIT=1` is set explicitly

2. Pull request

- `Commitlint / Validate PR Commits` validates the commits included in the PR
- `CI / Lint And Test` validates the affected projects in the PR

3. Merge to `main`

- `CI / Lint And Test` runs again on the merged commit
- `CI / Release Apps` runs on `main`, bumps app versions when warranted, writes the release commit with `[skip ci]`, pushes tags, and creates GitHub Releases

4. Release output

- the release commit updates app version files in source control
- the release commit message includes `[skip ci]` so the bot-written commit does not trigger a second CI loop
- git tags and GitHub Releases are created directly by the release step in `CI`

5. Deployment

- `CD / Build Release Artifact` builds one deployment artifact from the merged `main` commit
- `CD / Deploy To Dev` deploys that same built artifact into the development environment automatically after successful `CI` on `main`
- `CD` can also be run manually to promote that same artifact into `qa`, `stg`, or `prod`
- `prod` deployment remains gated by the GitHub `prod` environment approval rules

CI workflow behavior:

- it uses `nrwl/nx-set-shas@v4` to resolve the correct base and head commits in GitHub Actions
- it runs `npm run validate:tags` across the workspace
- it runs `npx nx affected -t lint`
- it runs `npx nx affected -t test --runInBand`
- on pushes to `main`, it also runs `CI / Release Apps`
- `CI / Release Apps` uses `GITHUB_TOKEN` and a `[skip ci]` release commit message to avoid recursive workflow runs
- `nx fix-ci` is not enabled yet because that is only useful after connecting the workspace to Nx Cloud

Commitlint workflow behavior:

- it runs on pull requests targeting `main`
- it checks the PR commit range, not just the PR title
- local Husky commitlint remains the first enforcement layer on developer machines

Release automation behavior:

- the release step lives inside `CI` instead of a separate release workflow
- it only runs on pushes to `main`
- it uses Nx Release to update app manifests, create the release commit, create tags, and publish GitHub Releases
- it skips Nx package publishing because this repo releases applications, not publishable npm packages
- the release commit message is `chore(release): publish [skip ci]`
- because the release commit is pushed back to `main`, GitHub branch protection must allow the GitHub Actions release actor to perform that push

Environment deployment workflow behavior:

- `CD` is the only top-level deployment workflow shown in GitHub Actions
- `CD / Build Release Artifact` packages one deployable artifact from the merged `main` commit
- `CD / Deploy To Dev` runs automatically after successful `CI` on `main` and deploys that artifact to `dev`
- `CD / Deploy To QA` is a manual promotion path for QA deployment of the same artifact
- `CD / Deploy To Staging` is a manual promotion path for staging deployment of the same artifact
- `CD / Deploy To Production` is a manual promotion path for production deployment of the same artifact
- `CD / Deploy To Production` uses the GitHub `prod` environment and is intended to be gated with required reviewers
- `deploy-dev.yml`, `deploy-qa.yml`, `deploy-stg.yml`, and `deploy-prod.yml` are reusable environment workflows called by `cd.yml`
- manual promotion through `CD` requires:
- `artifact_name`
- `artifact_run_id`
- all environment deploy workflows are scaffolds right now and need the real platform-specific deployment commands

## Release Model

Nx Release is configured for application releases, not library package publishing.

Current release groups:

- `web` -> `web-app`
- `mobile` -> `mobile-app`

Versioning model:

- web and mobile release independently
- internal libraries under `libs/` are not independently versioned
- release tags use the pattern `{projectName}@{version}`
- per-app GitHub Releases are the release notes source of truth
- workspace-level changelog generation is disabled

Current version sources:

- web semantic version: `apps/web-app/package.json`
- mobile semantic version: `apps/mobile-app/package.json`
- Expo reads the mobile version through `apps/mobile-app/app.config.js`
- native build numbers remain separate operational values and are not the same as semver
- until the first real release tags exist, Nx Release falls back to those app manifests to bootstrap the initial release
- CI now writes the committed app manifests forward during the automated release step
- git tags and GitHub Releases remain the durable release artifacts

What that means in practice:

- after a successful release on `main`, source control and the release tags should agree on the released version
- if the applications need to display the true release version at runtime, the committed manifest is again a valid source after the release step
- deployment environments (`dev`, `qa`, `stg`, `prod`) are separate from semantic release versioning and should be promoted intentionally
- higher environments should promote the same built artifact that was already deployed to `dev`

Recommended release flow:

```powershell
merge feature PRs to main
let CI publish the release commit, tags, and GitHub Releases without package publishing
```

Operational summary:

```powershell
feature PR -> Commitlint + CI -> merge to main -> CI on main -> CI releases apps with [skip ci] -> CD builds artifact and deploys dev -> run CD manually with artifact_name + artifact_run_id to promote qa/stg/prod
```

Practical mental model:

- use semantic versions for what product teams and users recognize as a release
- use git tags and generated changelogs as the release history
- keep internal libs versionless from a product perspective until one actually needs to be published on its own
- in this repository, protected `main` is the reviewed source of truth for app versions and GitHub Releases are the published release notes
- environment deployment is a separate concern from semantic versioning: `dev` builds once from `main`, and `qa`, `stg`, and `prod` should promote that same artifact with gated approvals rather than rebuilding from refs

Release decision examples:

- change only in `apps/web-app/src/**` with a `feat(web-app): ...` commit: expect `web-app` to bump
- change only in `apps/mobile-app/src/**` with a `fix(mobile-app): ...` commit: expect `mobile-app` to bump
- change in shared `libs/**`: one or both apps may bump depending on relevance
- `docs`, `chore`, `ci`, and most non-user-facing repo changes do not normally create semver bumps

## Observability And Logging

Recommended default stack for this LOS backbone:

- OpenTelemetry for traces, metrics, and correlation context
- Pino for structured application logs in Node.js and Next.js server/runtime code

Do not log:

- SSN
- bank account numbers
- full DOB
- tax identifiers
- raw document payloads
- access tokens
- passwords

Prefer:

- masked identifiers
- internal entity IDs
- correlation IDs
- event names
- latency and status metadata

## Git Hooks And Commit Format

This repo uses Husky hooks.

Pre-commit:

- runs `lint-staged`
- runs project tag validation
- fixes and lints staged source files before commit

Commit message:

- enforced by `commitlint`
- must follow Conventional Commits

Recommended format:

```text
type(scope): subject
```

Common types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `ci`
- `build`

Examples:

```text
feat(mobile-app): add gluestack button primitive
feat(web-app): add borrower dashboard shell
docs(readme): document workspace architecture
chore(repo): add husky and commitlint
```

### Windows Husky Note

If `git commit` fails before the hook logic runs, make sure you are committing from your local terminal with Git for Windows installed correctly.

Typical local commit flow:

```powershell
git add .
git commit -m "feat(repo): bootstrap Nx apps, hooks, and docs"
```

If hook execution fails on Windows:

- confirm `git --version` works in the same terminal
- use a fresh PowerShell or Git Bash session
- rerun `npm install`
- rerun `npm run prepare`

Husky hooks in this repo:

- [pre-commit](c:/Users/vc4u2/Documents/Source/Repos/acme-los/.husky/pre-commit)
- [commit-msg](c:/Users/vc4u2/Documents/Source/Repos/acme-los/.husky/commit-msg)

Branching note:

- day-to-day changes should start from a branch, not `main`
- local direct commits to `main` are blocked by the Husky pre-commit hook
- if you intentionally need an exception, run the commit with `ALLOW_MAIN_COMMIT=1`

## Development Notes

- this repo currently uses `npm`, not `pnpm`
- React and React DOM are pinned to `19.1.0` for Expo compatibility
- the workspace uses Nx inferred targets from plugins in `nx.json`
- mobile e2e is Playwright against Expo Web, not Detox
- `apps/web-app/next-env.d.ts` is auto-generated by Next.js and may appear modified during local work
- project tag usage is now validated by `tools/scripts/validate-project-tags.mjs`
- Nx Release is configured for independent app releases via the `web` and `mobile` release groups

## Suggested Next Steps

The current foundation work is in place. The most logical follow-up items from here are:

- expand `libs/ui/web` with additional shadcn-style primitives such as `Input`, `Card`, `Dialog`, and `Sheet`
- expand `libs/ui/mobile` with additional gluestack primitives beyond the provider and first button
- connect `@acme-los/api/client` to real backend routes once the server contract is implemented
- add focused unit tests for the shared domain models and API contract helpers
- introduce web and mobile feature modules that consume the new shared UI and domain layers

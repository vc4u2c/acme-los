# ACME LOS

Nx monorepo backbone for a Loan Origination System.

Current workspace apps:

- `apps/web-app` - Next.js web application
- `apps/web-app-e2e` - Playwright e2e tests for the web app
- `apps/mobile-app` - Expo application
- `apps/mobile-app-e2e` - Playwright mobile-web e2e tests for the Expo app

Current shared libraries:

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

## Repo-Specific Corrections

This repository does not follow the generic sample names from older Nx walkthroughs.

Use these values for this repo:

- repo/workspace: `acme-los`
- package manager: `npm`
- web app: `web-app`
- mobile app: `mobile-app`

Not used here:

- `pnpm`
- `yarn`
- `los-monorepo`
- `los-web`
- `los-mobile`

Also note:

- this workspace uses `nx.json`, not an older `workspace.json` layout
- the Next.js app uses Jest, not Vitest
- mobile e2e is Playwright against Expo Web, not native-device Detox
- on Windows, `npx.cmd nx ...` or `node .\node_modules\nx\bin\nx.js ...` is safer than plain `npx` in restricted PowerShell setups

## Naming

Recommended project naming in this repo:

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
  tools/
  package.json
  package-lock.json
  nx.json
  tsconfig.base.json
```

`libs/` now contains the initial shared backbone for core, domain, api, and ui modules.

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

## Verify Your Environment

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

## PowerShell Nx Commands

Preferred on Windows PowerShell:

```powershell
npx.cmd nx <target> <project>
```

Equivalent direct Node form:

```powershell
node .\node_modules\nx\bin\nx.js run <project>:<target>
```

Examples:

```powershell
npx.cmd nx run web-app:dev
npx.cmd nx run mobile-app:start
npx.cmd nx graph
```

## Web App Commands

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

Check dependency graph:

```powershell
npx.cmd nx graph
node .\node_modules\nx\bin\nx.js graph
```

Show web app project details:

```powershell
npx.cmd nx show project web-app --web
node .\node_modules\nx\bin\nx.js show project web-app --web
```

## Mobile App Commands

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
npx.cmd nx run mobile-app:test
node .\node_modules\nx\bin\nx.js run mobile-app:test
```

Run e2e:

```powershell
npx.cmd nx run mobile-app-e2e:e2e
node .\node_modules\nx\bin\nx.js run mobile-app-e2e:e2e
```

Check dependency graph:

```powershell
npx.cmd nx graph
node .\node_modules\nx\bin\nx.js graph
```

Show mobile app project details:

```powershell
npx.cmd nx show project mobile-app --web
node .\node_modules\nx\bin\nx.js show project mobile-app --web
```

## Workspace Commands

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

Run lint and test together:

```powershell
npx.cmd nx run-many -t lint,test
node .\node_modules\nx\bin\nx.js run-many -t lint,test
```

## Current Testing Setup

Web:

- app framework: Next.js
- unit tests: Jest
- e2e: Playwright

Mobile:

- app framework: Expo
- unit tests: Jest
- e2e: Playwright against Expo Web

Note:

- `mobile-app-e2e` is not native-device Detox coverage
- it is browser-based e2e for the Expo app rendered on web with mobile device profiles

## Shared Libraries

Current structure:

```text
libs/
  core/
    types/
    utils/
    config/
    logger/
    observability/
    request-context/
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

## Boundary Rules

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

Architecture docs:

- [Domain Boundaries](c:/Users/vc4u2/Documents/Source/Repos/acme-los/docs/architecture/domain-boundaries.md)
- [Auth and API Contracts](c:/Users/vc4u2/Documents/Source/Repos/acme-los/docs/architecture/auth-and-api-contracts.md)

## Observability and Logging

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

Suggested future shared packages:

- `@acme-los/logger`
- `@acme-los/telemetry`
- `@acme-los/observability`

## Notes

- This repo currently uses `npm`, not `pnpm`
- React and React DOM are pinned to `19.1.0` for Expo compatibility
- Playwright output folders are ignored in `.gitignore`
- if `3000` is busy, Next may choose another port when running `web-app:dev`
- commands like `npx create-nx-workspace@latest los` are historical bootstrap commands, not something you should run inside this existing repo

## Git Hooks and Commit Format

This repo uses Husky hooks.

Pre-commit:

- runs `lint-staged`
- fixes/lints staged source files before commit

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
feat(web-app): add borrower dashboard shell
fix(mobile-app): handle expired session
docs(readme): add Nx PowerShell commands
chore(repo): add husky and commitlint
```

This will fail:

```text
updated stuff
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

## Suggested Next Steps

- add concrete models and DTOs inside the generated shared libraries
- enforce tag usage on future projects as they are added
- add auth and request-context shared libraries when implementation starts
- pin Node 24 in `.nvmrc` if you want repo-level enforcement

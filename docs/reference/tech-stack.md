# Tech Stack And Tooling

This is the repo-level reference for the stack, tooling, and workflow pieces
that support ACME LOS.

If you want the fastest path to running the repo, start at:

- [README.md](../../README.md)
- [Local development](../getting-started/local-development.md)
- [Workspace commands](../getting-started/workspace-commands.md)
- [VS Code setup](./vscode-setup.md)

## Workspace Foundation

### Monorepo

- `Nx`
  - orchestrates apps, libs, lint, test, e2e, build, release, and graph tooling
  - primary config:
    - [nx.json](../../nx.json)
    - [tsconfig.base.json](../../tsconfig.base.json)
    - [package.json](../../package.json)

### Package Manager

- `npm`
  - install with `npm install`
  - repo-level scripts live in [package.json](../../package.json)

### Language

- `TypeScript`
  - used across web, mobile, shared libs, scripts, and tests

## Applications

### Web App

- `Next.js`
  - App Router
  - web app lives in [apps/web-app](../../apps/web-app)
- `React`
- `Tailwind CSS`
- `Radix UI`
  - interactive web primitives
- shadcn-style composition
  - see [libs/ui/web/README.md](../../libs/ui/web/README.md)

### Mobile App

- `Expo`
- `React Native`
- `NativeWind`
- `Gluestack`
  - see [libs/ui/mobile/README.md](../../libs/ui/mobile/README.md)
- mobile app lives in [apps/mobile-app](../../apps/mobile-app)

## Shared Libraries

### API

- `libs/api/contracts`
  - app-owned request and response shapes
- `libs/api/web-client`
  - browser-safe calls into web `/api/*`
- `libs/api/domain-client`
  - server/domain-facing customer and application transport layer
- `libs/api/web-server`
  - server-side web facade helpers

### Auth

- `libs/auth/contracts`
- `libs/auth/core`
- `libs/auth/web`

### Domain

- `libs/domain/*`
  - customer and application models

### Core

- `libs/core/*`
  - config, logger, types, and utility helpers

### UI

- `libs/ui/web`
- `libs/ui/mobile`

## Auth And Security Stack

### Identity

- `Okta`
  - hosted sign-in
  - hosted registration
  - MFA and funding step-up support
  - admin-plane docs:
    - [infra/okta/README.md](../../infra/okta/README.md)

### Web Auth Shape

- server-side PKCE initiation
- server-side callback exchange
- opaque HTTP-only auth session cookie
- CSRF protection on mutating web routes
- centralized server-side state for auth, customer, and application flow
- security inspector enabled by default in `local` and `dev`, opt-in elsewhere

### Server State

- `Redis`
  - preferred durable path for local hardened flows and future deployment
- file-backed fallback
  - local convenience fallback under `.next/cache/acme-los-web-state`

See:

- [Current platform architecture](../architecture/current-platform.md)
- [Server-side auth flows](../architecture/auth-server-flows.md)

## Testing And Verification

### Unit / Integration

- `Jest`
  - web and shared test path
- `jest-expo`
  - mobile test path

### E2E

- `Playwright`
  - web e2e
  - mobile e2e against Expo Web

### Linting / Formatting

- `ESLint`
- `Prettier`

### Accessibility

- `axe-core`
  - exercised through the web Playwright accessibility checks

Common verification commands:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

For more command examples:

- [Workspace commands](../getting-started/workspace-commands.md)

## Commit And Hook Tooling

### Git Hooks

- `Husky`
  - hook files live in [.husky](../../.husky)

Current hooks:

- `pre-commit`
  - blocks direct commits to `main` unless `ALLOW_MAIN_COMMIT=1`
  - runs `lint-staged`
  - runs `tools/scripts/validate-project-tags.mjs`
- `commit-msg`
  - runs `commitlint`

### Staged File Enforcement

- `lint-staged`
  - configured in [package.json](../../package.json)

### Commit Format Enforcement

- `commitlint`
  - config in [commitlint.config.cjs](../../commitlint.config.cjs)

Expected commit format:

```text
type(scope): subject
```

Examples:

```text
feat(auth): harden server state
docs(readme): add tech stack guide
chore(repo): refresh Expo compatibility
```

## CI/CD And Release Tooling

### CI/CD

- `GitHub Actions`
  - workflow files live in [.github/workflows](../../.github/workflows)

### Release

- `Nx Release`
  - commands:
    - `npm run release:dry-run`
    - `npm run release`

More detail:

- [Release and delivery](../operations/release-and-delivery.md)

## Repository Utilities

Useful repo-level scripts in [package.json](../../package.json):

- `validate:tags`
- `redis:up`
- `redis:down`
- `web:dev:redis`
- `okta:render`
- `okta:bootstrap`
- `okta:cleanup`

## Why This Doc Exists

This repo has enough moving parts that "look in git history" is not good
enough for onboarding.

This doc exists so someone can quickly answer:

- What stack are we on?
- What does Nx do here?
- What enforces commit quality?
- What powers web vs mobile?
- Where do auth and server state fit?
- Which tool owns release and CI?

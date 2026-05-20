# Tech Stack And Tooling

This is the repo-level reference for the stack, tooling, and workflow pieces
that support ACME LOS.

If you want the fastest path to running the repo, start at:

- [README.md](../../README.md)
- [Local development](../getting-started/local-development.md)
- [Workspace commands](../getting-started/workspace-commands.md)
- [VS Code setup](./vscode-setup.md)

## Capability Matrix

| Area                  | Current stack and design facets                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace             | Nx 22, npm, TypeScript, `apps/*` and `libs/*`, project tags, affected graph, independent release groups                                      |
| Web                   | Next.js 16 App Router, React 19, Tailwind CSS, shadcn-style `new-york`, Radix UI, Lucide icons                                               |
| Web data/UI workflows | TanStack React Query, React Form, React Table, showcase grid/table system, shared web UI primitives                                          |
| Mobile                | Expo 55, React Native 0.83, NativeWind, Gluestack, React Navigation, Expo Web e2e lane                                                       |
| BFF                   | `.NET` 10 Minimal API, OpenAPI, Scalar UI, health/readiness, dev-only inspector, Wolverine-backed customer/application handlers              |
| Auth                  | Okta hosted sign-in/registration, server-side PKCE, id-token validation, opaque sessions, funding step-up MFA                                |
| Security              | HTTP-only cookies, CSRF double-submit protection, trusted Next-to-BFF proxy secret, optional Entra service auth, CSP, rate limits/audit logs |
| State                 | Redis-backed server state in hardened local/Azure paths, local file fallback for Next, BFF in-memory fallback for scaffolding                |
| Azure                 | ACA, Key Vault, Azure Managed Redis, private endpoints, private DNS, NSGs, managed identity, environment-driven scale, budgets, pause/resume |
| Observability         | Application Insights, Log Analytics, workbook, alerts, structured JSON logs, `traceparent`, correlation IDs                                  |
| Analytics             | Repo-owned GA4/GTM manifests, runtime tag loader, data layer page-view events, consent defaults, Measurement Protocol guidance               |
| CI/CD                 | GitHub Actions CI/CD, environment wrappers, teardown workflows, project-prefixed release/deploy artifacts                                    |
| Quality gates         | Husky, lint-staged, commitlint, project-tag validation, ESLint, Prettier, Jest, Playwright, xUnit, Reqnroll, `dotnet format`                 |

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
- optional Entra managed-identity service auth between Next and the internal BFF
  when `bffRuntime.serviceAuth.mode=entra` is configured

### Server State

- `Redis`
  - hardened local option
  - default Azure deployment state path
  - used for server-side auth, customer, and application-flow state in the
    current web runtime
- file-backed fallback
  - local convenience fallback under `.next/cache/acme-los-web-state`

See:

- [Current platform architecture](../architecture/current-platform.md)
- [Server-side auth flows](../architecture/auth-server-flows.md)

## Digital Analytics Admin Plane

- GA4 and GTM setup intent lives under [infra/analytics](../../infra/analytics)
- `infra/analytics/environments/*.json` captures environment-specific account,
  property, stream, container, consent-default, and Measurement Protocol secret
  names
- `infra/analytics/events.json` defines the first app-owned data layer event
  taxonomy and key-event candidates
- `npm run analytics:render -- <env>` renders local env files under
  `tmp/analytics`
- `AnalyticsScripts` and `AnalyticsRouteTracker` wire the Next runtime to GTM
  or direct GA4 through environment variables

The runtime analytics implementation is intentionally separate from Azure
operational telemetry. Marketing/product events must stay allowlisted and free
of tokens, cookies, PII, and form payloads.

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
- `okta:render`
- `okta:bootstrap`
- `okta:cleanup`
- `analytics:render`
- `analytics:check-admin-token`
- `dotnet:audit`
- `azure:show-state`
- `azure:pause:web`
- `azure:resume:web`
- `analytics:admin-plan`

Useful Redis-backed local web targets:

- `npx.cmd nx run web-app:dev-redis`
- `npx.cmd nx run web-app:redis-up`
- `npx.cmd nx run web-app:redis-down`

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

# ACME LOS

ACME LOS is an Nx monorepo for a consumer lending experience with:

- a Next.js web app
- an Expo / React Native mobile app
- shared auth, API, domain, and UI libraries
- hosted Okta authentication with MFA and funding step-up
- CI/CD, release automation, and environment promotion

The root README is intentionally short. Use it to get running, then follow the linked docs for deeper setup, architecture, and operations details.

## Start Here

Install dependencies:

```powershell
npm install
```

Run the web app:

```powershell
npx.cmd nx run web-app:dev
```

That uses the file-backed local web-state path by default.

If you want the Redis-backed hardened local path instead, you need Docker
Desktop running and can use:

```powershell
npm run web:dev:redis
```

When you are done with the local Redis container:

```powershell
npm run redis:down
```

For the full local run/setup details, including the Redis path, see
[Local development](./docs/getting-started/local-development.md).

Run the mobile app:

```powershell
npx.cmd nx run mobile-app:start
```

Run the full verification sweep:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

If you need hosted sign-in, guarded `/apply/*` routes, or the customer dashboard, also complete the Okta setup in [infra/okta/README.md](./infra/okta/README.md).

## Docs Map

Start with the docs index:

- [docs/README.md](./docs/README.md)

Most useful follow-on docs:

- [Local development](./docs/getting-started/local-development.md)
- [Workspace commands](./docs/getting-started/workspace-commands.md)
- [Tech stack and tooling](./docs/reference/tech-stack.md)
- [Azure platform plan](./docs/operations/azure-platform-plan.md)
- [Azure governance and lifecycle](./docs/operations/azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./docs/operations/azure-bootstrap-and-teardown.md)
- [GitHub and Azure environments](./docs/operations/github-azure-environments.md)
- [Pipeline portability](./docs/operations/pipeline-portability.md)
- [Azure infrastructure scaffold](./infra/azure/README.md)
- [Azure naming standard](./docs/reference/azure-resource-naming-standard.md)
- [VS Code setup](./docs/reference/vscode-setup.md)
- [Current platform architecture](./docs/architecture/current-platform.md)
- [Server-side auth flows](./docs/architecture/auth-server-flows.md)
- [Next web server/client boundaries](./docs/architecture/web-server-client-boundaries.md)
- [Auth and API contracts](./docs/architecture/auth-and-api-contracts.md)
- [Domain boundaries](./docs/architecture/domain-boundaries.md)
- [Release and delivery](./docs/operations/release-and-delivery.md)
- [Okta admin plane](./infra/okta/README.md)
- [Web UI library](./libs/ui/web/README.md)
- [Mobile UI library](./libs/ui/mobile/README.md)

## If You Are New Here

Read these in order if you want the shortest path to understanding the repo
without getting buried in details too early:

1. [Local development](./docs/getting-started/local-development.md)
2. [Workspace commands](./docs/getting-started/workspace-commands.md)
3. [Tech stack and tooling](./docs/reference/tech-stack.md)
4. [Current platform architecture](./docs/architecture/current-platform.md)
5. [Server-side auth flows](./docs/architecture/auth-server-flows.md)
6. [Next web server/client boundaries](./docs/architecture/web-server-client-boundaries.md)

## Auth Diagrams

If you want the current implemented auth and authorization flow in diagram form, start here:

- [Server-side auth flows](./docs/architecture/auth-server-flows.md)

That doc includes Mermaid diagrams for:

- hosted sign-in and callback exchange
- guarded-route session checks
- route-level assurance and authorization decisions
- shared session use across profile, apply, and sign-out
- server-driven logout

## Current Platform

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

- shared auth contracts and core helpers under `libs/auth/*`
- shared domain and API contracts under `libs/domain/*` and `libs/api/*`
- shared UI libraries for web and mobile under `libs/ui/*`
- centralized server-side web state with Redis support and a local file fallback

## Recent Evolution

Scanning the recent commit history, the repo has moved through these main phases:

- redesigned the web shell and migrated to the current seven-step apply flow
- added hosted Okta sign-in, customer dashboard, and funding step-up behavior
- split browser-facing web API clients from domain-facing server clients
- moved the web auth flow to server-side PKCE with an opaque session cookie
- centralized auth, customer, and application state on the server
- hardened the auth edges, cleaned dependencies, and removed the unused Okta Terraform path

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
    getting-started/
    operations/
  infra/
    okta/
  libs/
    api/
    auth/
    core/
    domain/
    ui/
  tools/
```

## Development Notes

- package manager is `npm`
- use `npx.cmd nx ...` on Windows
- `npx.cmd nx run web-app:dev` uses the file-backed local state path by default
- `npm run web:dev:redis` uses the Redis-backed local state path and requires Docker Desktop
- `npm run redis:down` stops the local Redis container started for the hardened web path
- see [Workspace commands](./docs/getting-started/workspace-commands.md) for the common Nx targets and patterns
- `apps/web-app/next-env.d.ts` is generated by Next.js
- mobile e2e is Playwright against Expo Web, not Detox
- the web security inspector is demo-only and explicitly opt-in

# ACME LOS

ACME LOS is an Nx monorepo for a consumer lending experience with:

- a Next.js web app
- an Expo / React Native mobile app
- shared auth, API, domain, and UI libraries
- hosted Okta authentication with MFA and funding step-up
- CI/CD, release automation, and environment promotion

The root README is intentionally short. Use it to get running, then follow the linked docs for deeper setup, architecture, and operations details.

## Where We Are Now

The repo is now a production-shaped pre-prod platform rather than a prototype.
The main architectural decision is stable: browsers call the same-origin
Next.js `/api/*` facade, and real Okta-backed routes delegate to the `.NET`
BFF. The BFF is the auth/session, CSRF, customer-profile, and
application-flow authority behind the public Next facade; explicit mock auth
remains local for tests and lightweight UI work.

Current strengths:

- independent Nx Release versioning for `web-app`, `mobile-app`, and
  `bff-api`
- project-prefixed GitHub release artifacts for web, mobile, and BFF API
- hosted Okta sign-in, registration, server-side PKCE, id-token validation,
  opaque HTTP-only sessions, logout, and funding step-up MFA
- read-only customer dashboard with Okta-hosted widget actions for login email,
  phone/SMS, and password, with backend email sync after a fresh Okta session
- BFF-owned CSRF issuance, with Next preserving the stable browser
  `/api/security/csrf` contract
- dev-only security inspector support for BFF-owned auth/session state, with a
  token-free local snapshot for explicit mock auth
- composite health that reports both web and BFF layer status, versions, and
  build identifiers
- repo-owned GA4/GTM analytics admin plane and web runtime with environment
  manifests, data layer taxonomy, consent defaults, and a render script for
  local/runtime config
- Azure Container Apps `dev` runtime with Redis, Key Vault, managed identity,
  private endpoints for state/secrets, monitoring, pause/resume controls, and
  normal CI/CD deployment from `main`
- source-owned Next-to-BFF service-auth hardening path using Entra
  managed-identity bearer tokens, layered with internal BFF ingress and trusted
  proxy-secret validation
- staged ACS-backed Okta SMS MFA path with purchased dev toll-free sender
  `+18772244103`, disabled until Microsoft toll-free verification is approved

Still intentionally not final:

- `dev` is proven; `qa` promotion should be the next environment proof
- customer/application data is still transitional server-side state, not the
  long-term durable system of record
- Front Door, WAF, custom domains, and private-origin production edge hardening
  are later phases
- the security inspector remains a local/dev demo and troubleshooting surface

## Demo Feature Inventory

Use this as the quick grouped list when explaining what the repo demonstrates.
The presenter-focused version lives in
[Azure and website demo runbook](./docs/operations/azure-and-website-demo-runbook.md).

### Workspace And Engineering System

- `Nx` monorepo with `apps/*`, `libs/*`, affected project graph, and
  independent release groups
- `npm`, `TypeScript`, shared path aliases, project tags, and repo-wide scripts
- `Husky`, `lint-staged`, `commitlint`, project-tag validation, ESLint, and
  Prettier
- Jest, Playwright, `.NET` xUnit, Reqnroll/Gherkin BFF acceptance tests, and
  `dotnet format`
- VS Code REST Client `.http` checks for local BFF, Next facade, CSRF, and
  trusted-header API testing

### Product Surfaces

- Next.js 16 App Router web app with public pages, seven-step application flow,
  customer dashboard, security demo, logging demo, and environment/version
  visibility
- Expo 55 / React Native mobile app with shared release visibility and UI
  foundations
- shared contracts, auth helpers, domain models, web/mobile UI libraries, and
  server/client boundary libraries

### Web UI System

- Tailwind CSS, Radix primitives, shadcn-style `new-york` composition, `cn()`,
  `class-variance-authority`, and `tailwind-merge`
- Lucide icons and shared UI primitives under `libs/ui/web`
- TanStack React Query, React Form, and React Table, including the showcase
  grid/table system
- React 19 composition with server-rendered route shells and focused client
  islands

### Backend And API Boundary

- `.NET` BFF app under Nx with Minimal APIs, OpenAPI, Scalar UI, health/readiness
  endpoints, and modular feature folders
- stable Next `/api/*` facade so browser code does not call the raw BFF URL
- BFF auth/session endpoints, customer profile endpoints, application flow
  endpoints, CSRF endpoint, and health endpoint
- BFF security inspector endpoint used only through the authenticated Next
  facade and trusted server-to-server boundary in local/dev
- Wolverine used selectively behind the HTTP/security boundary for BFF
  customer/application commands and queries

### Auth And Security

- Okta hosted sign-in and registration with environment-specific callback URLs
- server-side PKCE, nonce/state validation, custom-domain issuer policy, and
  server-side id-token validation
- opaque HTTP-only auth session cookie with server-enforced idle and absolute
  expiry
- CSRF double-submit protection for mutating facade/BFF routes
- funding route step-up MFA with fresh Okta prompt semantics
- trusted Next-to-BFF identity headers guarded by a shared proxy secret outside
  local development
- optional Entra managed-identity bearer validation between Next and the BFF
  once `bffRuntime.serviceAuth` is configured for an environment
- CSP keeps browser application traffic on the Next origin and Okta, not the raw
  BFF origin

### Azure And Operations

- landing-zone-shaped Azure setup with management groups, workload/platform
  split, budgets, and lifecycle scripts
- Azure Container Apps for web and BFF, Redis for shared state, Key Vault for
  runtime secrets, private DNS, private endpoints, NSGs, and managed identity
- Application Insights, Log Analytics, alert rules, workbook, structured JSON
  logs, W3C `traceparent`, and app-level correlation IDs
- GA4/GTM admin-plane manifests, runtime tag loader, app-owned data layer page
  events, key-event candidates, environment render script, and manual Google
  setup checklist
- GitHub Actions CI/CD with release, deploy, teardown, and environment-wrapper
  workflows
- BFF replicas follow the environment runtime scale settings unless explicitly
  overridden
- pause/resume commands for non-production cost control

## Current Dev Cloud URLs

- Hosted app: `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`
- Health check: `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`

## Start Here

Install dependencies:

```powershell
npm install
```

If `registry.npmjs.org` is blocked by a network firewall, point `npm`
at the Yarn registry mirror instead.

Run it directly for the current install:

```powershell
npm install --registry "https://registry.yarnpkg.com/"
```

Set it permanently for your user profile:

```powershell
npm config set registry "https://registry.yarnpkg.com/"
```

Run the web app:

```powershell
npx.cmd nx run web-app:dev
```

That uses the file-backed local web-state path by default.

If you want the Redis-backed hardened local path instead, you need Docker
Desktop running and can use:

```powershell
npx.cmd nx run web-app:dev-redis
```

When you are done with the local Redis container:

```powershell
npx.cmd nx run web-app:redis-down
```

For the full local run/setup details, including the Redis path, see
[Local development](./docs/getting-started/local-development.md).

Run the full local web + BFF stack:

The `/api/*` facade is server-side, not browser-side. The client keeps calling
the same Next.js `/api/*` routes. For real Okta-backed behavior, those Next
route handlers validate the browser boundary, forward trusted identity headers
where needed, and proxy to the `.NET` BFF. Explicit mock auth remains local for
test fixtures and lightweight UI work.

Preferred one-command path:

```powershell
npx.cmd nx run web-app:dev-stack
```

That starts local Redis, the `.NET` BFF, and the Next web app with
`ACME_BFF_BASE_URL`, `ACME_WEB_STATE_STORE=redis`, and
`ACME_REDIS_URL=redis://127.0.0.1:6379` wired for the local process tree.
For local server-to-server proxying, the command uses the BFF HTTP loopback URL
`http://localhost:5186` so Node does not need to trust the ASP.NET Core
self-signed HTTPS development certificate.
If you need to override that URL for the one-command stack, set
`ACME_DEV_STACK_BFF_BASE_URL`; the script still passes it to the web app as
`ACME_BFF_BASE_URL`.

The npm alias is:

```powershell
npm run web:dev:stack
```

Manual split-terminal path for troubleshooting:

Terminal 1:

```powershell
$env:ACME_BFF_BASE_URL='http://localhost:5186'
npx.cmd nx run web-app:dev-redis
```

Terminal 2:

```powershell
$env:ACME_WEB_STATE_STORE='redis'
$env:ACME_REDIS_URL='redis://127.0.0.1:6379'
dotnet run --project apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj --launch-profile http
```

Useful local URLs for the full stack:

- web app: `http://localhost:3000`
- stable browser-facing health route: `http://localhost:3000/api/health`
- stable browser-facing CSRF route: `http://localhost:3000/api/security/csrf`
- BFF direct health route for terminal/direct checks: `http://localhost:5186/bff/health`
- BFF OpenAPI in development: `http://localhost:5186/openapi/v1.json`

Do not call the raw BFF URL from browser application code. The web app CSP is
intentionally scoped to the Next origin plus Okta, so browser traffic should use
the stable `/api/*` facade, for example `http://localhost:3000/api/health`.

If you set `ACME_WEB_SESSION_SECRET`, use the same value in both terminals.
For normal non-production local development, both the web app and the BFF fall
back to the same local development secret automatically.

For the trusted Next-to-BFF identity handoff, the one-command stack also shares
`ACME_BFF_TRUSTED_PROXY_SECRET` between both processes. Local development can
run without it, but any non-development BFF deployment that accepts trusted
identity headers must require this secret or an equivalent private network
boundary before those headers are honored.

Entra managed-identity service auth is disabled in the local stack by default.
Use it in Azure only after the environment has a BFF API audience and token
scope, then set `bffRuntime.serviceAuth.mode=entra` in the environment config.

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

If you need hosted sign-in, guarded `/apply/*` routes, or the customer
dashboard, also complete the Okta setup in
[infra/okta/README.md](./infra/okta/README.md). If your firewall or VPN
blocks the Okta sign-in domain (`auth.avanai.net`), complete the hosted
sign-in flow outside the VPN.

## Docs Map

The docs are split by job:

- use the getting-started docs to run the repo
- use the architecture docs to understand the current implementation
- use the operations docs to deploy, verify, pause, resume, or tear down Azure
  environments
- use the reference docs for stable standards and tooling details

Start with the docs index:

- [docs/README.md](./docs/README.md)

Most useful follow-on docs:

- [Local development](./docs/getting-started/local-development.md)
- [Workspace commands](./docs/getting-started/workspace-commands.md)
- [Tech stack and tooling](./docs/reference/tech-stack.md)
- [HTTP API testing](./docs/reference/http-api-testing.md)
- [Azure platform plan](./docs/operations/azure-platform-plan.md)
- [Azure and website demo runbook](./docs/operations/azure-and-website-demo-runbook.md)
- [Repeated workflows and skill map](./docs/operations/repeated-workflows-and-skill-map.md)
- [Azure governance and lifecycle](./docs/operations/azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./docs/operations/azure-bootstrap-and-teardown.md)
- [Azure monitoring and workbooks](./docs/operations/azure-monitoring-and-workbooks.md)
- [GitHub and Azure environments](./docs/operations/github-azure-environments.md)
- [Pipeline portability](./docs/operations/pipeline-portability.md)
- [Okta SMS MFA with Azure Communication Services](./docs/operations/okta-sms-mfa-with-acs.md)
- [Okta account security and profile sync](./docs/operations/okta-account-security-and-profile-sync.md)
- [Azure infrastructure scaffold](./infra/azure/README.md)
- [Azure naming standard](./docs/reference/azure-resource-naming-standard.md)
- [VS Code setup](./docs/reference/vscode-setup.md)
- [Current platform architecture](./docs/architecture/current-platform.md)
- [Enterprise readiness](./docs/architecture/enterprise-readiness.md)
- [Server-side auth flows](./docs/architecture/auth-server-flows.md)
- [Next web server/client boundaries](./docs/architecture/web-server-client-boundaries.md)
- [Auth and API contracts](./docs/architecture/auth-and-api-contracts.md)
- [Domain boundaries](./docs/architecture/domain-boundaries.md)
- [Release and delivery](./docs/operations/release-and-delivery.md)
- [Okta admin plane](./infra/okta/README.md)
- [Analytics admin plane](./infra/analytics/README.md)
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

If your goal is operations rather than development, jump next to:

1. [Release and delivery](./docs/operations/release-and-delivery.md)
2. [Azure bootstrap and teardown](./docs/operations/azure-bootstrap-and-teardown.md)
3. [Azure and website demo runbook](./docs/operations/azure-and-website-demo-runbook.md)

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
- added server-enforced idle session expiry with a client warning modal
- proved the `dev` web runtime on Azure Container Apps with Redis, Key Vault,
  private endpoints, and Azure-native monitoring
- added trace-context logging demos that connect browser-origin events, server
  logs, container output, and Application Insights queries
- cleaned release/deploy behavior, Expo compatibility, and repo automation

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
    analytics/
    azure/
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
- Azure non-prod workload cost-control commands live in:
  - [Azure bootstrap and teardown](./docs/operations/azure-bootstrap-and-teardown.md)
  - `npm run azure:show-state -- -EnvironmentName dev`
  - `npm run azure:pause:web -- -EnvironmentName dev`
  - `npm run azure:resume:web -- -EnvironmentName dev`
- `npx.cmd nx run web-app:dev` uses the file-backed local state path by default
- `npx.cmd nx run web-app:dev-redis` uses the Redis-backed local state path and requires Docker Desktop
- `npx.cmd nx run web-app:redis-down` stops the local Redis container started for the hardened web path
- see [Workspace commands](./docs/getting-started/workspace-commands.md) for the common Nx targets and patterns
- `apps/web-app/next-env.d.ts` is generated by Next.js
- mobile e2e is Playwright against Expo Web, not Detox
- the web security inspector is demo-only and explicitly opt-in

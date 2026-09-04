# Azure And Website Demo Runbook

This runbook is the presenter-friendly walkthrough for showing the ACME LOS
`dev` environment in both Azure and the website.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure monitoring and workbooks](./azure-monitoring-and-workbooks.md)
- [Azure bootstrap and teardown](./azure-bootstrap-and-teardown.md)
- [Current platform architecture](../architecture/current-platform.md)
- [Enterprise readiness](../architecture/enterprise-readiness.md)
- [Auth and API contracts](../architecture/auth-and-api-contracts.md)
- [HTTP API testing](../reference/http-api-testing.md)
- [Analytics admin plane](../../infra/analytics/README.md)

## Demo Story

The clean story to tell is:

1. we built a real landing-zone-shaped Azure foundation
2. the workload runs in `Azure Container Apps`
3. secrets and state are not kept in browser storage or in-process memory
4. `Key Vault` and `Redis` are private-only
5. monitoring, logs, alerts, and workbooks are already wired
6. the web app proves the platform behavior through live auth, session, and
   scale behavior

## Capability Inventory

Use this section when you need the grouped architecture story before opening the
portal or clicking through the website. It is intentionally broad: the goal is
to show the full platform surface, not just the visible web pages.

### Executive Demo Themes

- consumer lending product experience across public pages, account pages, and a
  seven-step application journey
- production-shaped monorepo with web, mobile, BFF, shared libraries, release
  automation, CI/CD, and source-owned infrastructure
- server-side auth/session architecture with Okta, opaque cookies, CSRF,
  funding step-up MFA, Redis-backed state, and a reversible BFF migration switch
- Azure landing-zone-shaped runtime with Container Apps, Key Vault, Managed
  Redis, private endpoints, private DNS, managed identity, monitoring, alerts,
  pause/resume, and teardown
- separate operational telemetry and digital analytics stories: Azure Monitor
  for engineering/ops, GA4/GTM for product and journey analytics

### Repository And Workspace Foundation

- Nx 22 monorepo with `apps/*`, `libs/*`, `infra/*`, `tools/*`, and docs
- npm package management and repo-level scripts in `package.json`
- TypeScript path aliases for shared API, auth, core, domain, and UI packages
- Nx project tags enforce ownership boundaries such as `scope:core`,
  `scope:api`, `scope:auth`, `scope:domain`, `scope:ui`, `type:app`,
  `platform:web`, and `platform:mobile`
- shared libraries:
  - `libs/api/contracts` for app-owned DTOs
  - `libs/api/web-client` for browser-safe `/api/*` calls
  - `libs/api/domain-client` for server/domain transport
  - `libs/api/web-server` for Next facade server helpers
  - `libs/auth/contracts`, `libs/auth/core`, and `libs/auth/web`
  - `libs/core/config`, `libs/core/logger`, `libs/core/types`,
    `libs/core/utils`, and `libs/core/analytics`
  - `libs/domain/customer` and `libs/domain/application`
  - `libs/ui/web` and `libs/ui/mobile`

### Local Development And Developer Experience

- normal web local run with `npx.cmd nx run web-app:dev`
- hardened Redis-backed web run with `npx.cmd nx run web-app:dev-redis`
- one-command local web plus BFF plus Redis stack with
  `npx.cmd nx run web-app:dev-stack` or `npm run web:dev:stack`
- local Redis lifecycle targets:
  `web-app:redis-up`, `web-app:redis-down`, and `npm run redis:*`
- direct BFF local run through `dotnet run`
- Expo mobile local run with `npx.cmd nx run mobile-app:start`
- VS Code REST Client `.http` checks for BFF health, auth/session, CSRF,
  trusted proxy headers, and local API smoke tests
- rendering demo routes for static, server, ISR, and client rendering modes
- visible non-prod environment and version badges so a presenter can prove
  where the app is running

### Versioning, Release Notes, And Artifact Strategy

- Nx Release owns independent versioning for `web-app`, `mobile-app`, and
  `bff-api`
- conventional commits drive semantic release decisions
- project tags use `web-app@<version>`, `mobile-app@<version>`, and
  `bff-api@<version>`
- GitHub releases are created per release group; repo file changelogs are not
  the release-note source of truth
- release bundles are project-prefixed, for example web, mobile, and BFF API
  release assets
- deployable artifacts are also project-prefixed and include source SHA,
  artifact name, artifact run, version metadata, and image tag
- the web deployable currently carries the public Next app and runtime-coupled
  internal BFF deployment
- BFF semantic version is recorded independently and carried into Azure through
  `ACME_BFF_VERSION`
- `/api/health` exposes web and BFF version/build metadata when the BFF path is
  enabled

### GitHub CI/CD And Promotion

- PR and `main` CI run through `.github/workflows/ci.yml`
- CD into `dev` runs after successful `main` CI through `.github/workflows/cd.yml`
- reusable deployment workflow:
  `.github/workflows/deploy-web-environment.yml`
- environment wrapper workflows exist for `dev`, `qa`, `stg`, and `prod`
- separate mobile deployment workflow exists for the mobile lane
- teardown workflow exists for non-prod and requires explicit destructive
  confirmation for production
- GitHub environments are intended to model `dev`, `qa`, `stg`, and `prod`
  approval boundaries
- Azure deployment behavior stays in repo scripts and Bicep; GitHub Actions is
  the orchestrator, not the deployment source of truth
- promotion strategy is to validate once, produce recorded artifacts, and
  promote artifact identity and source SHA rather than "whatever is on branch"

### Engineering Guardrails And Verification

- Husky blocks accidental direct local commits to `main`
- `lint-staged` formats and lints staged source
- `commitlint` enforces conventional commit shape
- `tools/scripts/validate-project-tags.mjs` guards Nx project tag hygiene
- Prettier and ESLint cover the TypeScript/React workspace
- Jest covers web, mobile, route handlers, auth/session, analytics, and shared
  behavior
- Playwright covers web browser e2e, accessibility smoke checks, application
  start, security inspector, and mobile Expo Web smoke tests
- `.NET` xUnit covers the BFF unit/integration layer
- Reqnroll/Gherkin covers BFF acceptance-style flows for health, auth/session,
  customer profile, and security behavior
- `npm run dotnet:audit` and `npm audit` give vulnerability-audit paths
- `npx.cmd nx run web-app:build --skip-nx-cache` validates Next production
  build, TypeScript, and static route generation

### Web Product Experience

- Next.js 16 App Router with React 19
- public landing page, rates/terms, support, legal, showcase, rendering demo,
  logging demo, security demo, account sign-in, account profile,
  and seven-step application routes
- seven application steps:
  `personal-info`, `disclosures`, `employment-income`, `bank-card`,
  `pre-approval`, `documents-signing`, and `funding`
- customer dashboard under `/account/profile`
- product-style landing page and support content rather than a blank sample app
- runtime environment badge and build/version visibility
- route shells keep server/client boundaries explicit; interactive form flows
  live in focused client islands

### Web UI System

- Tailwind CSS styling with shadcn-style `new-york` composition
- Radix UI primitives for accessible interaction surfaces
- shared `cn()` utility, `class-variance-authority`, and `tailwind-merge`
- Lucide icons for UI controls
- shared web primitives under `libs/ui/web`: accordion, alert, button, card,
  checkbox, dialog, dropdown menu, form field, input, progress, radio group,
  select, sheet, and textarea
- TanStack React Query for client data workflows
- TanStack React Form and Zod schemas for form behavior and validation
- TanStack React Table powers the showcase grid/table experience
- accessibility checks include axe-based smoke coverage

### Mobile Experience

- Expo 55 and React Native 0.83 application shell
- NativeWind and Gluestack UI foundation
- React Navigation stack readiness
- dashboard and showcase screens
- shared mobile UI primitives under `libs/ui/mobile`
- Expo config exposes release/version information
- mobile e2e lane uses Playwright against Expo Web for the current automation
  path
- future Okta mobile auth integration is structurally prepared but not the
  current demo focus

### Auth, Identity, And Session Security

- app-owned Okta IDX sign-in and registration
- hosted Gen3 sign-in retained for mobile redirect and rollback only
- environment-specific Okta manifests for `dev`, `qa`, `stg`, and `prod`
- local and `dev` map to the Okta `dev` tenant with separate redirect and logout URLs
- custom Okta domain issuer policy
- server-generated PKCE and server-side Interaction Code exchange
- nonce/state validation and server-side id-token validation
- opaque HTTP-only web session cookie
- tokens stay out of normal browser storage
- server-enforced idle timeout and absolute session expiry
- browser idle warning modal can demonstrate short `dev` idle behavior
- server-driven logout and Okta logout hint support
- rate limiting and auth audit logging on sensitive paths
- `leadId` tracking is separated from customer identity and session concerns
- hosted Okta light/dark mode is persisted with the non-sensitive
  `acme_theme` preference; cross-redirect continuity activates once the app is
  live at the prepared sibling hostname `apply-dev.avanai.net`

### Funding Step-Up And Assurance

- funding route requires stronger assurance than ordinary application steps
- passwordless funding access omits both two-factor `acr_values` and
  `max_age=0`; the possession-only Okta app policy asks for one email or
  phone/SMS OTP without requiring the password again
- ACME app keep-me-signed-in is disabled in the Okta manifest so funding
  step-up presents the authenticator challenge instead of a post-auth
  "stay signed in" interstitial
- each funding page entry consumes the latest funding step-up marker
- Interaction Code completion must include Okta `amr` evidence for email or phone/SMS OTP
  before the marker is written
- funding save/submit APIs can use the bounded 10-minute funding API window
  after validated completion
- assurance checks are part of route and API enforcement, not only UI state
- funding step-up is visible in both auth behavior and analytics events

### CSRF, Facade Security, And Browser Boundary

- browser code calls same-origin Next `/api/*` routes
- raw BFF URL is for server-to-server or terminal checks, not browser app code
- CSRF double-submit protection covers mutating browser/facade routes
- BFF-issued CSRF cookie is relayed through `/api/security/csrf`
- Next validates browser cookies/session/CSRF before proxying protected calls
- Content Security Policy keeps application traffic scoped to the Next origin
  plus approved identity and analytics endpoints
- trusted Next-to-BFF identity headers require the internal boundary plus
  `ACME_BFF_TRUSTED_PROXY_SECRET` outside local development
- optional Entra service auth lets Next attach a managed-identity bearer token
  and lets the BFF validate tenant, audience, and allowed caller before `/bff/*`
  routes execute
- security inspector is explicitly local/dev oriented and opt-in elsewhere

### BFF And API Layer

- `.NET` 10 Minimal API BFF under Nx
- OpenAPI JSON and Scalar UI in development
- health, readiness, and live-style checks
- auth flow endpoints for IDX start/completion, logout, session read, touch,
  requirement checks, and logout hints
- CSRF endpoint
- customer profile endpoints
- application flow endpoints
- security inspector endpoint for local/dev diagnostics through the trusted
  Next facade
- diagnostic trace endpoint for logging-demo Next-to-BFF correlation proof
- Wolverine-backed customer/application command and query handlers behind the
  HTTP/security pipeline
- BFF request logging, trusted proxy validation, cookie handling, CSRF,
  correlation, and OpenTelemetry concerns live before handlers

### BFF Facade Architecture

- browser contracts stay stable while real Okta-backed route authority lives in
  the BFF
- Next keeps the public browser contract and delegates selected
  auth/session/customer/application/security routes to the BFF
- the BFF is the auth/session, CSRF, customer-profile, and application-flow
  authority
- security inspector shows BFF-owned Okta token/session state
- browser-origin telemetry stays on the Next facade; the logging demo uses a
  separate diagnostic trace API to prove the Next-to-BFF hop

### State, Persistence, And Data Boundaries

- Redis-backed server state is the hardened local and Azure path
- local file-backed state exists as a developer fallback for the Next web app
- BFF has Redis-backed stores plus local scaffolding fallback where appropriate
- state categories include auth sessions, auth transactions, customer profile,
  application flow, CSRF, and rate-limit state
- Azure Redis uses Microsoft Entra auth through managed identity
- local Redis uses Docker Compose and connection-string auth
- customer/application data remains transitional server-side workflow state,
  not the final durable system of record
- future durable persistence should sit behind backend services or the BFF
  without changing browser contracts

### Azure Governance And Landing Zone

- management-group hierarchy exists for platform, landing zones, online, and
  sandbox organization
- platform, non-prod online, prod online, and sandbox subscription model is
  represented in source-owned config
- subscription budget helper scripts exist for cost guardrails
- platform/workload split separates shared monitoring/DNS from workload compute
- Bicep and PowerShell scripts own environment creation instead of portal-only
  steps
- deployment stacks, bootstrap, sync, teardown, pause, and resume scripts keep
  lifecycle operations repeatable

### Azure Workload Runtime

- Azure Container Apps runs the public Next web app
- internal BFF Container App runs behind the Next facade
- Container App Environment hosts the workload
- Azure Managed Redis is the shared state path
- Key Vault holds runtime secrets
- user-assigned managed identity supports ACR pull, Key Vault access, and Redis
  Entra auth
- workload VNet has app and data subnets
- Redis and Key Vault use private endpoints in the data subnet
- private DNS zones live in the platform subscription and link to workload
  VNets
- NSGs make the app-to-data boundary explicit
- BFF replica settings follow environment runtime scale unless explicitly
  overridden
- non-prod pause/resume controls stop and restart web/BFF compute and alerting
  posture for cost control

### Observability And Operational Telemetry

- Application Insights and Log Analytics collect app and platform telemetry
- Azure Monitor workbook provides a presenter-friendly operational view
- alert rules exist for failed requests, exceptions, auth failures, and system
  errors
- structured JSON logs include environment, service, version, build, route,
  trace, span, parent span, correlation, and request metadata
- W3C `traceparent` is the standard trace propagation header
- `X-Correlation-ID` is carried separately for app/business correlation
- logging demo shows browser-origin telemetry, server-origin logs, traced flow,
  API event ingestion, client errors, and server errors
- `/api/observability/events` validates allowlisted browser-origin operational
  events before logging them
- telemetry ingestion remains on the Next facade; BFF diagnostic tracing is a
  separate demo path

### Digital Analytics And Tag Management

- GA4/GTM admin-plane intent is source-owned under `infra/analytics`
- environment manifests exist for `dev`, `qa`, `stg`, and `prod`
- real browser-safe Google IDs are stored as public config values; API secrets
  are not committed
- `infra/analytics/events.json` defines the app-owned event taxonomy
- first key-event candidates include application start, step completion,
  submit success, `generate_lead`, funding step-up completion, and
  preapproval offer selection
- `@acme-los/core/analytics` owns generic browser analytics primitives:
  consent mapping, safe pathname normalization, event IDs, dataLayer dispatch,
  and direct gtag dispatch
- web app analytics layer owns ACME LOS event builders for page views,
  application milestones, sign-in attempts, login, sign-in failure, funding
  step-up, submit click, submit success, submit failure, and `generate_lead`
- Next runtime loads GTM or direct GA4 only when analytics is enabled and valid
  IDs are configured
- GA4 automatic page views are disabled so app-owned `page_view` is the source
  of truth
- events strip query strings, hashes, tokens, cookies, PII, and form payloads
- `npm run analytics:render -- <env>` renders local/runtime config
- `npm run analytics:admin-plan -- <env>` renders custom dimensions,
  key-event, GTM trigger/tag, and report-planning output
- Google account, GA4 property, GTM container, consent, and key-event setup are
  documented as manual/admin-plane steps until an approved Google admin
  credential model exists

### Runtime Health And Demo Proof Points

- `/api/health` reports environment, build, instance/process details, web
  health, and BFF health when enabled
- repeated health calls can show ACA replica distribution through changing
  instance metadata
- `/api/health/live` exists for live-style checks
- direct BFF health is useful from terminal/private contexts
- security inspector proves active auth/session authority in local/dev
- logging demo proves trace and correlation across browser, Next, and logs
- Redis demo proves session continuity across multiple web replicas

### Public Website Demo Surfaces

- `/` landing page
- `/rates-terms`
- `/support/contact`
- `/legal/privacy`, `/legal/terms`, `/legal/accessibility`, and
  `/legal/licenses`
- `/account/sign-in`
- `/account/register`
- `/account/recover-password`
- `/account/unlock`
- `/account/profile`
- `/account/security/email`, `/account/security/phone`, and
  `/account/security/password`
- `/apply` and `/apply/[step]`
- `/security`
- `/logging-demo`
- `/showcase`
- `/rendering-demo`, `/rendering-demo/static`, `/rendering-demo/server`,
  `/rendering-demo/isr`, and `/rendering-demo/client`

### Browser-Facing API Demo Surfaces

- `/api/auth/idx/start`
- `/api/auth/idx/complete`
- `/api/auth/logout`
- `/api/auth/session`
- `/api/auth/session/touch`
- `/api/customer/profile`
- `/api/application/steps/[step]`
- `/api/application/submit`
- `/api/security/csrf`
- `/api/security/inspector`
- `/api/observability/events`
- `/api/showcase/grid`
- `/api/health`
- `/api/health/live`

### Admin Plane And Source-Owned Infrastructure

- `infra/azure` owns Azure Bicep, config, and deployment scripts
- `infra/okta` owns Okta environment manifests, branding input, render,
  bootstrap, cleanup, and hosted sign-in helper scripts
- `infra/analytics` owns GA4/GTM environment manifests, event taxonomy, admin
  plan rendering, and local admin-token resolution helpers
- generated runtime outputs go under ignored `tmp/*` paths
- secrets stay in Key Vault, GitHub environments, local secret files, or local
  environment variables, not committed docs/manifests

### Documentation And Runbooks

- root README gives quick start, current posture, and a short demo inventory
- docs index routes readers by intent
- architecture docs cover current platform, server auth flows, BFF rollout,
  auth/API contracts, domain boundaries, and enterprise readiness
- operations docs cover release/delivery, Azure bootstrap/teardown, governance,
  monitoring/workbooks, GitHub/Azure environments, pipeline portability, and
  this demo runbook
- reference docs cover tech stack, HTTP API testing, VS Code setup, and Azure
  naming standards
- package-level READMEs cover BFF, Azure, Okta, analytics, web UI, and mobile UI

### Current Honest Assessment

- `dev` is real and deploys from `main` through CI/CD
- BFF auth/session is the current real-Okta path behind the Next facade
- if a direct BFF URL times out from your workstation, that is expected for the
  internal ACA endpoint; use the public Next `/api/*` facade for browser and
  manual web checks
- customer and application persistence are still transitional server-side state,
  not the final durable backend record
- `qa` promotion proof, real alert receivers, durable persistence, Front Door,
  WAF, activation of the prepared branded app hostname, private-origin
  production edge hardening, and regional resilience remain next phases
- server-side GA4 Measurement Protocol emission is not implemented yet; browser
  GA/GTM runtime is the current product analytics path
- the grouped security, scalability, fault-tolerance, and enterprise-readiness
  assessment lives in
  [Enterprise readiness](../architecture/enterprise-readiness.md)

## Refresh Before The Demo

The `dev` ACA public hostname can change when the environment is rebuilt.
The stable customer-facing hostname `apply-dev.avanai.net` is prepared in
source but should not be used as the demo URL until DNS validation,
Bicep-managed certificate binding, and Okta redirect URI cutover have completed.

Run this before the demo if you want to confirm the current URL:

```powershell
$ingressFqdn = az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query 'properties.configuration.ingress.fqdn' `
  --output tsv

"https://$ingressFqdn"
```

Current known `dev` site:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`

Current health endpoint:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`

## Azure Portal Walkthrough

Use this order so the story feels intentional.

### 1. Governance And Subscription Shape

Start at management groups and subscriptions:

- tenant root
- `mg-acme`
- `mg-acme-platform`
- `mg-acme-landingzones`
- `mg-acme-online`
- `mg-acme-sandbox`

Then show the subscriptions:

- `sub-acme-platform`
- `sub-acme-nonprod-online`
- `sub-acme-prod-online`
- `sub-acme-sandbox`

Talking points:

- governance is persistent
- workloads can be created and destroyed without destroying the landing zone
- budgets are set per subscription

### 2. Platform Subscription

Go to `sub-acme-platform`.

Show:

- resource group `rg-acme-hub-network-cus-01`
- resource group `rg-acme-hub-monitor-cus-01`

In `rg-acme-hub-network-cus-01`, show:

- private DNS zone `privatelink.vaultcore.azure.net`
- private DNS zone `privatelink.redis.azure.net`

Talking points:

- shared DNS stays in the platform subscription
- workload VNets link into the shared platform DNS zones
- this is the platform/workload split, not one giant flat subscription

In `rg-acme-hub-monitor-cus-01`, show:

- Log Analytics workspace `log-acme-los-dev-cus-01`
- Application Insights resource `appi-acme-los-dev-cus-01`
- workbook `wbk-acme-los-ops-dev-cus-01`
- action group `ag-acme-los-ops-dev-cus-01`
- alert rules:
  - `alrt-acme-los-failed-requests-dev-cus-01`
  - `alrt-acme-los-exceptions-dev-cus-01`
  - `alrt-acme-los-auth-failures-dev-cus-01`
  - `alrt-acme-los-system-errors-dev-cus-01`

Talking points:

- monitoring ownership is platform-oriented
- the workload emits telemetry, but the ops plane is centralized
- alert receivers still need to be wired later

### 3. Workload Subscription

Go to `sub-acme-nonprod-online`, then resource group
`rg-acme-los-web-dev-cus-01`.

Show the workload resources:

- `cae-acme-los-dev-cus-01`
- `ca-acme-los-web-dev-cus-01`
- `vnet-acme-los-web-dev-cus-01`
- `kvacmelosdevcus01v42c`
- `redis-acme-los-dev-cus-01`
- `id-acme-los-web-dev-cus-01`
- `pep-acme-los-kv-dev-cus-01`
- `pep-acme-los-redis-dev-cus-01`
- `nic-acme-los-kv-dev-cus-01`
- `nic-acme-los-redis-dev-cus-01`

Talking points:

- workload compute, network, state, and private endpoints live with the workload
- shared DNS and shared ops live in platform
- this is the spoke pattern

### 4. VNet And Subnets

Open `vnet-acme-los-web-dev-cus-01`.

Show these subnets:

- app subnet:
  - `snet-acme-los-app-dev-cus-01`
- data subnet:
  - `snet-acme-los-data-dev-cus-01`

Talking points:

- ACA environment infrastructure uses the app subnet
- `Key Vault` and `Redis` private endpoints use the data subnet
- the naming is now semantic and easier to explain than service-shaped names

### 5. Container Apps

Open:

- `cae-acme-los-dev-cus-01`
- `ca-acme-los-web-dev-cus-01`

Show:

- ingress FQDN
- revision list
- replica count
- scale:
  - `minReplicas = 2`
  - `maxReplicas = 2`

Talking points:

- this is why we can demonstrate load-balanced requests across replicas
- the app is public for now
- later `Front Door` can be added in front and the ACA origin can be made private

### 6. Key Vault

Open `kvacmelosdevcus01v42c`.

Show:

- networking is private-only
- private endpoint exists
- secret references are consumed by ACA through managed identity

Talking points:

- secrets are not living in GitHub secrets as runtime configuration
- the app uses managed identity to read what it needs

Do not spend time showing raw secret values.

### 7. Managed Redis

Open `redis-acme-los-dev-cus-01`.

Show:

- networking/private endpoint
- metrics
- the resource is private-only

Talking points:

- session state is server-side
- it is no longer a per-instance in-memory store
- this is what allows auth/session continuity across multiple ACA replicas

### 8. Monitoring

Show three places:

1. `Application Insights`
   - `appi-acme-los-dev-cus-01`
2. `Log Analytics`
   - `log-acme-los-dev-cus-01`
3. Workbook
   - `wbk-acme-los-ops-dev-cus-01`

Best order:

1. workbook for the high-level view
2. App Insights for request/exception detail
3. Log Analytics for container/platform log detail

## Website Walkthrough

### 1. Landing Page

Open the `dev` site:

- `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`

Show:

- environment label shows `dev`
- the experience looks like the real product, not a blank sample app

### 2. Start The Auth Flow

Click `Start application`.

Talking points:

- same Okta tenant is used for `local` and `dev`
- redirect URIs differ by environment
- auth is server-side, not a client-only token dance
- after branded app-host activation, light/dark mode remains consistent through
  the redirect to `auth.avanai.net` without sharing auth cookies

### 3. Continue Into The Application Flow

Walk through:

- app-owned IDX sign-in
- server-side Interaction Code completion
- arrival on `/apply/*`

Talking points:

- one main authenticated web session
- profile and apply routes share the same session boundary
- session is opaque and server-side
- `dev` uses a short 120 second idle window so the inactivity warning modal can be tested quickly

### 4. Validate Funding Step-Up MFA

Open:

- `/apply/funding`

What to prove:

- unauthenticated access redirects to
  `/account/sign-in?returnTo=%2Fapply%2Ffunding&aal=aal2`
- while `fundingStepUpRequiresPassword=false`, the funding sign-in start sends
  neither two-factor `acr_values` nor `max_age=0`; the possession-only app
  policy asks for one email-or-phone OTP without asking for the password again
- an existing `aal2` session is not enough by itself; each funding page entry
  consumes the funding step-up marker written by the latest validated IDX
  completion
- after the Okta challenge completes, funding save/submit APIs can use that
  marker during the bounded 10-minute funding API window

Quick unauthenticated checks:

```powershell
$baseUrl = "https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io"

$fundingRoute = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "$baseUrl/apply/funding" `
  -MaximumRedirection 0 `
  -TimeoutSec 120

$fundingRoute.StatusCode
$fundingRoute.Headers.Location

$webSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$csrf = Invoke-RestMethod `
  -Method Get `
  -Uri "$baseUrl/api/security/csrf" `
  -WebSession $webSession `
  -TimeoutSec 120

$idxStart = Invoke-RestMethod `
  -Method Post `
  -Uri "$baseUrl/api/auth/idx/start" `
  -WebSession $webSession `
  -Headers @{ 'x-csrf-token' = $csrf.csrfToken } `
  -ContentType 'application/json' `
  -Body '{"returnTo":"/apply/funding","minimumAssuranceLevel":"aal2"}' `
  -TimeoutSec 120

$idxStart.issuer
$idxStart.stepUpReason
$idxStart.acrValues
$idxStart.maxAgeSeconds
```

Expected result:

- route status is `307`
- route location includes `returnTo=%2Fapply%2Ffunding` and `aal=aal2`
- IDX start returns `stepUpReason` `funding`
- IDX start returns an empty `acrValues` for passwordless funding
- IDX start does not return a PKCE verifier or any OAuth token
- `maxAgeSeconds` is empty when funding is configured for possession-only OTP
  The final proof still needs an interactive browser session with a real dev Okta
  user:

1. sign in normally
1. open `/apply/funding`
1. complete the Okta email or phone/SMS step-up challenge without entering a
   password
1. confirm the funding page loads and funding save/submit calls no longer return
   the step-up error during the 10-minute API window
1. leave funding and open `/apply/funding` again; it should start a new Okta
   step-up challenge instead of reusing the consumed route-entry marker

### 5. Show The Security Demo Page

Open:

- `/security`

This is only meant for `local` and `dev`.

Show:

- session cookie presence
- decoded token payload
- server-side session shape

Talking points:

- browser-visible token payload and server-side session are not the same thing
- some values can be session-backed even if they are not present in the raw JWT
- this helps explain the `leadId` / `customerId` distinction when needed

### 6. Show Health And Replica Distribution

Open the health endpoint repeatedly:

- `/api/health`

Current response includes:

- `environment`
- `build`
- `instanceId`
- `processId`
- `servedAt`

Talking points:

- requests are going through the ACA ingress/load-balancing layer
- the public app URL routes to different healthy replicas
- the `instanceId` proves that multiple ACA instances are serving traffic

### 7. Tie The Website Back To Redis

Explain this while signed in:

- the app is running on 2 replicas
- the session is still valid as requests hit different replicas
- that works because session state is in Redis, not instance memory

That is the cleanest way to demonstrate Redis sessions without turning the demo
into a low-level cache inspection exercise.

### 8. Show Client And Server Logging

Open:

- `/logging-demo`

Show:

- the per-action `traceparent` behavior
- the per-action `X-Correlation-ID` response/request header
- the full correlation id and trace id shown after each action
- the `Handled by` value: `next-facade` when the Next route handles the event
  directly, `bff-api` when the diagnostic trace request round-trips through the
  BFF
- `Run traced flow`
- `Emit API event`
- `Call BFF trace API`
- `Log client error`
- `Log server error`

Talking points:

- server-side code writes normal `info`, `warn`, and `error` events directly
  through the shared logger
- browser-origin operational events use `POST /api/observability/events` only
  when they need to be visible in Azure; product flows should send those events
  as best-effort background calls so user work does not wait on telemetry
- the traced flow first writes `logging.demo.client.browser` in the browser,
  then posts an allowlisted event to `POST /api/observability/events` with the
  W3C `traceparent` header
- the server writes `logging.demo.client.received` and
  `logging.demo.server.processed` into the container log stream for that same
  trace id
- the standalone `Emit API event` action proves the generic endpoint can
  validate a bounded event and write through the shared logger; it is not how
  ordinary server-side logs are emitted
- `Call BFF trace API` posts to `POST /api/diagnostics/trace`; the Next facade
  validates CSRF, creates the next server span, forwards `traceparent`,
  `tracestate`, and `X-Correlation-ID` to `/bff/diagnostics/trace`, and the BFF
  echoes the same correlation id back
- server logs keep the browser span as `parentSpanId`/`incomingTraceparent` and
  write the server span as `spanId`/`traceparent`, which is the shape future
  downstream .NET calls should continue through OpenTelemetry propagation
- the error buttons use controlled throw/catch paths so the demo can show
  client-origin and server-origin errors without crashing the page
- `traceparent` is the standard propagation header; `X-TraceId` is a common
  custom or legacy convention but is not the standard tracing header
- `X-Correlation-ID` is carried as a separate app/business correlation header
  and echoed back after server validation
- every server-side log includes runtime fields such as `environment`,
  `service`, `version`, and `build`, so local, dev, and future higher
  environments remain easy to separate
- logging emission is non-blocking; the app does not wait on a logging transport
  to keep serving the request
- the full correlation id from the UI is the easiest value to paste into both
  App Insights and Container Apps log queries for one button click

## Monitoring Demo

### Workbook

Best things to show in the workbook:

- request volume
- failed requests
- exception count
- p95 latency
- dependency health
- warning/error logs
- ACA platform/system log sections

Talking point:

- this is the Azure-native ops view for support teams

### Application Insights

Best things to show:

- failed requests
- exceptions
- end-to-end request traces
- dependency calls

Example Kusto queries:

Copy and run one Kusto block at a time. If the portal reports a token like
`asclet`, the previous query's `asc` and the next query's `let` were pasted
together without clearing the query window or preserving a separator.

Run the `AppTraces` queries from `log-acme-los-dev-cus-01` or
`appi-acme-los-dev-cus-01`. If `AppTraces` does not resolve, the Logs blade is
scoped to the wrong resource.

For the container-log correlation query, keep the raw `LogMessage` column
visible. Next shared logger rows expose lower-case fields such as
`correlationId` and `handledBy`; .NET BFF JSON console rows can nest those
values in the framework payload/scope, but the same correlation id still appears
in the raw row.

```kusto
AppRequests
| where TimeGenerated > ago(30m)
| summarize Requests=count(), Failures=countif(Success == false), P95=percentile(DurationMs, 95);
```

```kusto
AppExceptions
| where TimeGenerated > ago(30m)
| project TimeGenerated, ProblemId, ExceptionType, Message
| order by TimeGenerated desc;
```

```kusto
AppTraces
| where TimeGenerated > ago(30m)
| where SeverityLevel >= 2
| project TimeGenerated, SeverityLevel, Message
| order by TimeGenerated desc;
```

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
AppTraces
| where TimeGenerated > ago(30m)
| extend props = todynamic(Properties)
| extend
    clientError = parse_json(tostring(props.clientError)),
    clientTelemetry = parse_json(tostring(props.clientTelemetry))
| extend
    event = tostring(props.event),
    correlationId = tostring(props.correlationId),
    traceId = tostring(props.traceId),
    spanId = tostring(props.spanId),
    parentSpanId = tostring(props.parentSpanId),
    incomingTraceparent = tostring(props.incomingTraceparent),
    traceparent = tostring(props.traceparent),
    route = tostring(props.route),
    environment = tostring(props.environment),
    service = tostring(props.service),
    version = tostring(props.version),
    build = tostring(props.build),
    clientErrorName = tostring(clientError.name),
    clientErrorMessage = tostring(clientError.message),
    clientPageUrl = tostring(clientTelemetry.pageUrl),
    clientReferrer = tostring(clientTelemetry.referrer),
    clientUserAgent = tostring(clientTelemetry.userAgent),
    clientLanguage = tostring(clientTelemetry.language),
    clientTimeZone = tostring(clientTelemetry.timeZone),
    clientVisibilityState = tostring(clientTelemetry.visibilityState),
    clientViewportWidth = toint(clientTelemetry.viewport.width),
    clientViewportHeight = toint(clientTelemetry.viewport.height),
    clientScreenWidth = toint(clientTelemetry.screen.width),
    clientScreenHeight = toint(clientTelemetry.screen.height),
    clientPixelRatio = todouble(clientTelemetry.screen.pixelRatio),
    clientConnectionType = tostring(clientTelemetry.connection.effectiveType)
| where correlationId == targetCorrelationId or LogMessage has targetCorrelationId
| project
    TimeGenerated,
    SeverityLevel,
    Message,
    event,
    correlationId,
    traceId,
    spanId,
    parentSpanId,
    incomingTraceparent,
    traceparent,
    route,
    environment,
    service,
    version,
    build,
    clientErrorName,
    clientErrorMessage,
    clientPageUrl,
    clientReferrer,
    clientUserAgent,
    clientLanguage,
    clientTimeZone,
    clientVisibilityState,
    clientViewportWidth,
    clientViewportHeight,
    clientScreenWidth,
    clientScreenHeight,
    clientPixelRatio,
    clientConnectionType
| order by TimeGenerated asc;
```

### Log Analytics

Best things to show:

- ACA console warnings/errors
- ACA platform/system events
- logging demo traced browser-to-server and API-handled events

Example queries:

Copy and run one Kusto block at a time.

Run these Container Apps log queries from the `log-acme-los-dev-cus-01` Log
Analytics workspace. Current `dev` raw ACA logs use the `_CL` table names.

```kusto
let containerAppName = 'ca-acme-los-web-dev-cus-01';
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30m)
| extend
    ContainerApp = tostring(ContainerAppName_s),
    RevisionName = tostring(RevisionName_s),
    LogMessage = tostring(Log_s)
| where ContainerApp =~ containerAppName
| where LogMessage has_any ("error", "warn", "fail")
| project TimeGenerated, RevisionName, LogMessage
| order by TimeGenerated desc;
```

```kusto
let targetCorrelationId = 'paste-full-correlation-id-from-ui';
let containerAppNames = dynamic([
  'ca-acme-los-web-dev-cus-01',
  'ca-acme-los-bff-dev-cus-01'
]);
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30m)
| extend
    ContainerApp = tostring(ContainerAppName_s),
    RevisionName = tostring(RevisionName_s),
    LogMessage = tostring(Log_s)
| where ContainerApp in~ (containerAppNames)
| where LogMessage has targetCorrelationId
| extend payload = parse_json(LogMessage)
| extend
    clientError = payload.clientError,
    clientTelemetry = payload.clientTelemetry
| extend
    level = tostring(payload.level),
    message = tostring(payload.message),
    event = tostring(payload.event),
    correlationId = tostring(payload.correlationId),
    handledBy = tostring(payload.handledBy),
    traceId = tostring(payload.traceId),
    spanId = tostring(payload.spanId),
    parentSpanId = tostring(payload.parentSpanId),
    incomingTraceparent = tostring(payload.incomingTraceparent),
    traceparent = tostring(payload.traceparent),
    route = tostring(payload.route),
    environment = tostring(payload.environment),
    service = tostring(payload.service),
    version = tostring(payload.version),
    build = tostring(payload.build),
    clientErrorName = tostring(clientError.name),
    clientErrorMessage = tostring(clientError.message),
    clientPageUrl = tostring(clientTelemetry.pageUrl),
    clientReferrer = tostring(clientTelemetry.referrer),
    clientUserAgent = tostring(clientTelemetry.userAgent),
    clientLanguage = tostring(clientTelemetry.language),
    clientTimeZone = tostring(clientTelemetry.timeZone),
    clientVisibilityState = tostring(clientTelemetry.visibilityState),
    clientViewportWidth = toint(clientTelemetry.viewport.width),
    clientViewportHeight = toint(clientTelemetry.viewport.height),
    clientScreenWidth = toint(clientTelemetry.screen.width),
    clientScreenHeight = toint(clientTelemetry.screen.height),
    clientPixelRatio = todouble(clientTelemetry.screen.pixelRatio),
    clientConnectionType = tostring(clientTelemetry.connection.effectiveType)
| where correlationId == targetCorrelationId
| project
    TimeGenerated,
    ContainerApp,
    RevisionName,
    level,
    message,
    LogMessage,
    event,
    correlationId,
    handledBy,
    traceId,
    spanId,
    parentSpanId,
    incomingTraceparent,
    traceparent,
    route,
    environment,
    service,
    version,
    build,
    clientErrorName,
    clientErrorMessage,
    clientPageUrl,
    clientReferrer,
    clientUserAgent,
    clientLanguage,
    clientTimeZone,
    clientVisibilityState,
    clientViewportWidth,
    clientViewportHeight,
    clientScreenWidth,
    clientScreenHeight,
    clientPixelRatio,
    clientConnectionType
| order by TimeGenerated asc;
```

```kusto
ContainerAppSystemLogs_CL
| where TimeGenerated > ago(30m)
| extend
    Reason = tostring(Reason_s),
    LogMessage = tostring(Log_s)
| project TimeGenerated, Reason, LogMessage
| order by TimeGenerated desc;
```

## Redis Session Demo

What to say:

- the session store is centralized and server-side
- two ACA replicas are live
- repeated requests hit both replicas
- the signed-in journey stays intact because session state is in Redis

What to show in Azure:

- `redis-acme-los-dev-cus-01`
- private endpoint `pep-acme-los-redis-dev-cus-01`
- NIC `nic-acme-los-redis-dev-cus-01`
- the resource is private-only

What to show in the website:

- sign in once
- browse a guarded route
- hit `/api/health` several times
- point out the changing `instanceId`
- explain that the session survives across those replicas

Command checks:

Use these only when you want to prove the backing state path. The normal demo
should still lead with the website and `/api/health` replica behavior.

Local Redis is a Docker Compose container with normal `redis-cli` access:

```powershell
npx.cmd nx run web-app:redis-up
npx.cmd nx run web-app:dev-redis
```

In another terminal:

```powershell
docker exec -it acme-los-redis redis-cli PING
docker exec -it acme-los-redis redis-cli INFO keyspace
docker exec -it acme-los-redis redis-cli --scan --pattern 'acme-los:web:*'
docker exec -it acme-los-redis redis-cli TYPE '<redis-key-from-scan>'
docker exec -it acme-los-redis redis-cli TTL '<redis-key-from-scan>'
```

Useful local key patterns:

- `acme-los:web:auth-session:*`
- `acme-los:web:application-flow:*`
- `acme-los:web:customer-profile:*`
- `acme-los:web:rate-limit:*`

Do not print live `auth-session` or `customer-profile` values during a shared
demo. Those records can include tokens or customer-entered details. `SCAN`,
`TYPE`, and `TTL` are enough to prove the state exists and expires.

Stop local Redis when done:

```powershell
npx.cmd nx run web-app:redis-down
```

`dev` Redis is different from local Redis:

- `redis-acme-los-dev-cus-01` is private-only through the private endpoint
  `pep-acme-los-redis-dev-cus-01`
- Redis access-key authentication is disabled for Azure
- the web app uses Microsoft Entra auth from the ACA user-assigned managed
  identity
- Redis data-plane checks must run from a private-network context, such as the
  running ACA container or a purpose-built diagnostic container/job in the
  workload VNet

For the running `dev` app, exec into the ACA web container:

```powershell
az containerapp exec `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --container web `
  --command "/bin/sh"
```

Inside the container, first confirm the Redis runtime settings:

```sh
node -e "for (const name of ['ACME_WEB_STATE_STORE','ACME_REDIS_AUTH_MODE','ACME_REDIS_HOST','ACME_REDIS_PORT','ACME_REDIS_KEY_PREFIX','ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID','AZURE_CLIENT_ID']) console.log(name + '=' + (process.env[name] || ''))"
```

Then prove private DNS and private endpoint reachability:

```sh
node -e "const dns = require('node:dns'); dns.lookup(process.env.ACME_REDIS_HOST, (error, address) => { if (error) throw error; console.log(address); })"
node -e "const net = require('node:net'); const socket = net.createConnection({ host: process.env.ACME_REDIS_HOST, port: Number(process.env.ACME_REDIS_PORT || 10000) }, () => { console.log('connected to Redis private endpoint'); socket.end(); }); socket.setTimeout(5000, () => { console.error('timeout'); socket.destroy(); process.exit(1); }); socket.on('error', (error) => { console.error(error.message); process.exit(1); });"
```

The production web image does not rely on `redis-cli`. Use the same Node Redis
client and Entra auth path as the app for a safe `PING`, key scan, type, and TTL
check:

```sh
node <<'NODE'
const { DefaultAzureCredential } = require('@azure/identity');
const { createClient } = require('@redis/client');
const {
  EntraIdCredentialsProviderFactory,
  REDIS_SCOPE_DEFAULT,
} = require('@redis/entraid');

const managedIdentityClientId =
  process.env.ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID || process.env.AZURE_CLIENT_ID;
const credential = new DefaultAzureCredential(
  managedIdentityClientId
    ? {
        managedIdentityClientId,
        workloadIdentityClientId: managedIdentityClientId,
      }
    : undefined,
);
const client = createClient({
  url: `rediss://${process.env.ACME_REDIS_HOST}:${
    process.env.ACME_REDIS_PORT || 10000
  }`,
  credentialsProvider:
    EntraIdCredentialsProviderFactory.createForDefaultAzureCredential({
      credential,
      scopes: REDIS_SCOPE_DEFAULT,
      tokenManagerConfig: {
        expirationRefreshRatio: 0.8,
      },
    }),
});

client.on('error', (error) => console.error(error));

(async () => {
  await client.connect();
  console.log(await client.ping());

  const prefix = process.env.ACME_REDIS_KEY_PREFIX || 'acme-los:web';
  const keys = [];

  for await (const keyBatch of client.scanIterator({
    MATCH: `${prefix}:*`,
    COUNT: 25,
  })) {
    for (const key of keyBatch) {
      keys.push(key);

      if (keys.length >= 20) {
        break;
      }
    }

    if (keys.length >= 20) {
      break;
    }
  }

  console.log(keys.length ? keys.join('\n') : '(no keys)');

  if (keys[0]) {
    console.log(`${keys[0]} type=${await client.type(keys[0])} ttl=${await client.ttl(keys[0])}`);
  }

  await client.quit();
})().catch(async (error) => {
  console.error(error);

  try {
    await client.quit();
  } finally {
    process.exit(1);
  }
});
NODE
```

## Presenter Notes

- do not spend time reading raw secrets in Key Vault
- do not spend time on generated ACA infrastructure internals
- keep the story on platform boundaries, runtime behavior, and operations
- if asked about NSGs:
  - they are already used to make the app-subnet and data-subnet boundary explicit
  - they do not replace the later Front Door, WAF, and private-origin hardening
- if asked whether replicas are directly reachable:
  - no, traffic goes through ACA ingress/load balancing

## Quick Demo Links

- website:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`
- health:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/api/health`
- security demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/security`
- funding MFA validation:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/apply/funding`
- logging demo:
  - `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/logging-demo`

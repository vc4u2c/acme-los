# BFF Rollout Plan

This doc describes the recommended path for adding a .NET BFF to ACME LOS
without relayouting the repo first.

Related docs:

- [current-platform.md](./current-platform.md)
- [auth-and-api-contracts.md](./auth-and-api-contracts.md)
- [bff-implementation-checklist.md](./bff-implementation-checklist.md)
- [future-repo-relayout-plan.md](./future-repo-relayout-plan.md)
- [adr-001-current-layout-first.md](./adr-001-current-layout-first.md)

## Decision Summary

- keep the repo name as `acme-los`
- do not relayout `apps/*` and `libs/*` before the BFF exists
- add the BFF inside the current repo shape
- keep the current browser-facing `/api/*` contract stable during the first
  rollout
- move persistence and backend-facing behavior first, then move more sensitive
  auth concerns once the BFF path is proven

## Why This Order

This repo already owns more than UI:

- web
- mobile
- shared libs
- auth
- Azure and Okta infrastructure
- CI/CD
- release automation
- tests
- docs
- repo tooling

That means a relayout is not a local folder cleanup. It is a repo-wide change.

The BFF creates more architectural value than a relayout because it:

- gives customer and application state a better long-term home
- keeps the Next facade thin
- creates a durable backend boundary for future persistence
- reduces the risk that business logic keeps accumulating in Next route handlers

## Recommended Initial Placement

Keep the current top-level layout and add one new app:

```text
apps/
  web-app/
  mobile-app/
  bff-api/
    Acme.Los.Bff.sln
    Acme.Los.Bff.Api/
    Acme.Los.Bff.Api.Tests/
```

Optional later:

```text
apps/
  bff-api/
    Acme.Los.Bff.AppHost/
```

Only add the optional `AppHost` if the team chooses `.NET Aspire` for local
inner-loop orchestration later. It should not be a day-one requirement.

## Recommended Stack

### Day-One Stack

- `ASP.NET Core 10` Web API
- vertical-slice modular monolith
- `OpenTelemetry`
- `ILogger` and structured logging
- `Redis` for session and short-lived state integration
- `Scalar` for API docs
- `ProblemDetails`

### Day-Two Or Later

- `Serilog` and `Destructurama` if the built-in logging pipeline is no longer
  enough
- `Wolverine` if command workflows, background handling, or asynchronous
  messaging actually become complex enough to justify it
- `Marten` plus `PostgreSQL` when customer or application persistence stops
  being temporary and needs durable storage
- `.NET Aspire` if the local orchestration experience is worth the extra moving
  parts

### What Not To Do On Day One

- do not add a database before the BFF contract is clear
- do not add an event bus just because the stack supports it
- do not split into microservices
- do not force NuGet publishing into the first pass unless reusable .NET
  libraries truly exist

## Internal Shape

Keep the executable as one modular monolith. Organize by feature first:

```text
Acme.Los.Bff.Api/
  Features/
    Auth/
    Session/
    Customer/
    Application/
    Observability/
  Infrastructure/
    Okta/
    Redis/
    Telemetry/
    Http/
  Common/
```

Good characteristics:

- feature handlers, validators, mapping, and endpoint wiring stay together
- infrastructure concerns stay out of feature folders
- slices can later graduate into shared libraries only when reuse is real

## Contract Strategy

Keep the current TypeScript contract boundary stable while the BFF arrives.

Current source of truth for browser-facing transport remains:

- `libs/api/contracts`
- `libs/api/web-client`
- `libs/api/domain-client`

That means the first BFF should implement the same wire contracts rather than
forcing a simultaneous contract rewrite across TypeScript and C#.

Recommended sequence:

1. keep the UI using the current web client wrappers
2. keep the browser talking to app-owned `/api/*` routes
3. repoint server-side domain access from Next helpers to the BFF
4. move more responsibility into the BFF behind the stable wire contract

This avoids coupling the BFF introduction to a breaking client rewrite.

Current bridge decision:

- the BFF switch belongs in the Next server route layer for this phase
- browser code should not read `ACME_BFF_BASE_URL`, `ACME_BFF_URL`, or
  `ACME_BFF_PROXY_MODE`, and should not choose the BFF directly
- `ACME_BFF_PROXY_MODE=next|bff` is the server-side route switch; the BFF base
  URL is endpoint configuration, not the rollout switch
- Next route handlers continue to own the same-origin browser route contract,
  redirects, browser cookie handoff, and CSRF checks while the BFF owns selected
  customer, application, auth transaction, Okta callback, and session-store
  behavior when the switch is enabled
- trusted identity headers are accepted only inside a trusted proxy boundary;
  outside local development, use `ACME_BFF_TRUSTED_PROXY_SECRET` or an
  equivalent private network control before the BFF honors those headers
- auth start, callback, session read/sync/touch/clear, requirement checks, and
  logout hints move behind the same `ACME_BFF_PROXY_MODE` switch; Next remains
  the browser facade for the public redirect URLs, final `Set-Cookie` emission,
  and mock-auth development fixtures
- `GET /api/security/csrf` remains browser-facing on the stable Next facade; in
  BFF mode it delegates issuance to `/bff/security/csrf` and relays the BFF
  cookie back to the browser
- `GET /api/security/inspector` remains browser-facing and authenticated on the
  stable Next facade; in BFF mode it reads the BFF-owned token/session snapshot
  from `/bff/security/inspector` through the trusted server-side proxy boundary
- after the BFF-owned auth path is proven in `dev` and `qa`, the team can
  revisit whether `/api/*` remains a thin Next proxy or whether a more direct
  BFF-facing route shape is cleaner

## Phased Rollout

### Phase 0: Repo Enablement

- add the official `@nx/dotnet` plugin
- let Nx infer `restore`, `build`, `test`, and `publish` from the `.csproj`
  files
- add the BFF app to CI lint, build, and test coverage where appropriate
- version the BFF as `bff-api` once it owns auth/session state, while keeping
  runtime promotion coupled to the web deployable until a separate BFF
  promotion lane is needed

Important note:

- as of April 23, 2026, the official `@nx/dotnet` plugin exists, but the Nx
  docs still mark it as experimental
- use it for workspace orchestration, affected runs, caching, and CI, but keep
  the first release path conservative

### Phase 1: Scaffold The BFF

Goal:

- create the .NET app, test project, health route, observability wiring, Redis
  wiring, and API docs surface
- deploy the BFF as an internal Azure Container App behind the Next facade

Definition of done:

- BFF builds and tests under Nx
- container build path exists
- health endpoint works
- OpenTelemetry is wired
- Redis integration boots cleanly
- Scalar docs render
- dev ACA deploys the BFF with internal ingress only
- Next receives `ACME_BFF_BASE_URL`, `ACME_BFF_PROXY_MODE=bff`, and the trusted
  proxy secret through IaC; the BFF receives the same web session secret so it
  can validate the opaque session cookie behind the facade

### Phase 2: Move Customer And Application Behavior First

Goal:

- move low-risk persistence-facing slices before the most sensitive auth flow

Recommended initial BFF slices:

- customer profile read and write
- application step read and save
- application submit
- business validation that does not require rethinking the web callback path

Definition of done:

- Next server-side domain calls point at the BFF
- browser-facing route shapes stay stable
- UI does not need a contract rewrite

### Phase 3: Move Session And Auth Concerns

Goal:

- move the higher-value auth and session concerns only after the BFF path is
  operationally trusted

Current BFF-mode endpoints:

- `GET /bff/auth/login`
- `GET /bff/auth/callback`
- `POST /bff/auth/logout`
- `GET /bff/auth/session`
- `POST /bff/auth/session`
- `DELETE /bff/auth/session`
- `POST /bff/auth/session/touch`
- `POST /bff/auth/session/requirement`
- `GET /bff/auth/logout-hint`
- `GET /bff/security/csrf`
- `GET /bff/security/inspector`

Definition of done:

- the BFF owns PKCE initiation, auth transaction state, Okta token exchange,
  id-token validation, and callback handling when `ACME_BFF_PROXY_MODE=bff`
- session storage, lookup, touch, requirement checks, and logout hints are stable
- funding step-up rules are preserved
- the dev-only security inspector follows the active session authority in both
  `next` and `bff` modes
- the Next layer stays a route shell and UX boundary, not the long-term auth
  engine

### Phase 4: Thin Or Remove Redundant Next API Facade Pieces

Goal:

- simplify the Next layer only after the BFF owns the real backend behavior

Possible end states:

- keep `/api/*` as a stable app-owned browser contract, with Next proxying to
  the BFF
- or let the browser call the BFF-backed app routes more directly if that shape
  is simpler and still preserves cookie, CSRF, and auth guarantees

Do not decide this before Phases 1 through 3 are proven.

## Suggested Creation Commands

These are the recommended starting commands when the BFF work begins:

```powershell
npx.cmd nx add @nx/dotnet
dotnet new sln -n Acme.Los.Bff -o apps/bff-api
dotnet new webapi -n Acme.Los.Bff.Api -o apps/bff-api/Acme.Los.Bff.Api
dotnet new xunit -n Acme.Los.Bff.Api.Tests -o apps/bff-api/Acme.Los.Bff.Api.Tests
dotnet sln apps/bff-api/Acme.Los.Bff.sln add apps/bff-api/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj
dotnet sln apps/bff-api/Acme.Los.Bff.sln add apps/bff-api/Acme.Los.Bff.Api.Tests/Acme.Los.Bff.Api.Tests.csproj
dotnet add apps/bff-api/Acme.Los.Bff.Api.Tests/Acme.Los.Bff.Api.Tests.csproj reference apps/bff-api/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj
```

## CI/CD And Release Guidance

For the first pass:

- treat the BFF as a deployable application, not as a NuGet package family
- let Nx handle affected calculation, build, test, and publish targets
- keep release automation conservative and project-prefixed
- keep the BFF in the `web-app` deploy unit while the Next facade owns the
  browser-facing API route contract

Recommended first release shape:

- containerized application release
- environment deployment through repo-owned scripts and workflows
- no independent NuGet release process unless reusable libraries appear later

Initial Azure shape:

- BFF ingress is internal to the Container Apps environment (`external: false`)
- Redis and Key Vault stay private endpoint backed platform dependencies
- the BFF trusted identity headers require `ACME_BFF_TRUSTED_PROXY_SECRET`
  outside local development
- the BFF runtime scale follows the environment runtime scale settings unless a
  `bffRuntime` override is added to the environment config
- this is private ACA ingress, not a separate Azure Private Endpoint resource
  for the BFF container app

## Non-Goals

- repo rename
- repo relayout
- moving all current TypeScript contracts into C#
- adding a permanent system-of-record database in the first BFF commit
- microservice decomposition

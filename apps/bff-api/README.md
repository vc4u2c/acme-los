# ACME LOS BFF

This folder is the planned home for the `.NET` backend-for-frontend for ACME
LOS.

The repo direction is:

- keep the current monorepo layout
- add the BFF as a new app under `apps/*`
- use `dotnet` to create the solution and projects
- let `Nx` orchestrate build, test, publish, and run through `@nx/dotnet`

## Prerequisites

- `.NET SDK 10`
- `Node.js 24.14.0`
- repo dependencies installed with `npm install`

Verify the SDK:

```powershell
dotnet --version
dotnet --list-sdks
```

## Nx Integration

Install the official Nx `.NET` plugin from the repo root:

```powershell
npx.cmd nx add @nx/dotnet@22.6.5
```

That updates:

- `package.json`
- `package-lock.json`
- `nx.json`
- `.gitignore`

## Create The Solution And Projects

Run these commands from the repo root.

Create the solution folder and solution file:

```powershell
dotnet new sln -n Acme.Los.Bff -f sln -o apps/bff-api
```

Create the API project:

```powershell
dotnet new webapi `
  -n Acme.Los.Bff.Api `
  -o apps/bff-api/src/Acme.Los.Bff.Api `
  --framework net10.0 `
  --use-controllers false
```

Create the test project:

```powershell
dotnet new xunit `
  -n Acme.Los.Bff.Api.Tests `
  -o apps/bff-api/tests/Acme.Los.Bff.Api.Tests `
  --framework net10.0
```

Add the projects to the solution:

```powershell
dotnet sln apps/bff-api/Acme.Los.Bff.sln add apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj
dotnet sln apps/bff-api/Acme.Los.Bff.sln add apps/bff-api/tests/Acme.Los.Bff.Api.Tests/Acme.Los.Bff.Api.Tests.csproj
```

Add the test-project reference:

```powershell
dotnet add apps/bff-api/tests/Acme.Los.Bff.Api.Tests/Acme.Los.Bff.Api.Tests.csproj reference apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj
```

## Recommended Solution Shape

Use one executable app and keep the first pass as a modular monolith:

```text
apps/
  bff-api/
    README.md
    Acme.Los.Bff.sln
    src/
      Acme.Los.Bff.Api/
        Features/
          Auth/
          Customer/
          Application/
          Observability/
          Platform/
          Security/
        Infrastructure/
          Auth/
          Security/
          State/
        Contracts/
        Common/
    tests/
      Acme.Los.Bff.Api.Tests/
    e2e/
      README.md
```

This keeps feature behavior together while leaving infrastructure concerns in a
separate place.

The `tests/` project should cover:

- endpoint contract tests
- handler behavior
- state-store configuration decisions
- security boundary expectations such as auth and CSRF failures

The `e2e/` folder is worth keeping from day one even if it starts with just a
README. It gives the solution an obvious home for black-box tests that hit the
running BFF over HTTP after we add a fuller local stack or CI environment.

Keep one `.http` file in the API project. It is still one of the fastest ways
to smoke-test health, OpenAPI, auth/session stubs, and early feature slices
without booting the whole web experience.

## First-Pass Package Direction

The first scaffold should add:

- OpenAPI generation
- Scalar UI
- health and readiness endpoints
- structured logging
- OpenTelemetry wiring

Hold these for later unless the scaffold proves too small:

- Serilog
- Destructurama
- Marten
- PostgreSQL
- `.NET Aspire`

Wolverine is now in use for the first customer-profile and application-flow
query and command handlers, but the rest of the BFF should stay selective
about adding more messaging patterns until the workflows truly need them.

## Expected Nx Commands After The Scaffold Exists

After the projects are created, inspect the inferred tasks:

```powershell
npx.cmd nx show projects
npx.cmd nx show project Acme.Los.Bff.Api
npx.cmd nx show project Acme.Los.Bff.Api.Tests
```

Typical task flow:

```powershell
npx.cmd nx build Acme.Los.Bff.Api
npx.cmd nx test Acme.Los.Bff.Api.Tests
npx.cmd nx run Acme.Los.Bff.Api:run
npx.cmd nx run Acme.Los.Bff.Api:publish
```

If the inferred project names differ, update this README to match the real
names discovered by `nx show project`.

## Next Route Switch

Keep the existing Next.js `/api/*` routes during the rollout and proxy selected
routes into the BFF only when you opt in with a server-side base URL:

```powershell
$env:ACME_BFF_BASE_URL = 'http://localhost:5186'
```

Use the BFF HTTP loopback URL for local Next-to-BFF proxy traffic. The BFF still
can expose `https://localhost:7206` through the `https` launch profile when you
explicitly need to exercise local TLS, but the default local web stack uses HTTP
so Node.js server-side `fetch` does not need to trust the ASP.NET Core
self-signed development certificate.

Browser application code should not call `http://localhost:5186` or
`https://localhost:7206` directly. Keep browser traffic on the stable Next
facade, for example `/api/health`, and let the Next route handlers perform the
server-side BFF proxy hop.

Current switched routes:

- `GET /api/health` -> composite Next + BFF health; includes `GET /bff/health`
  when the BFF base URL is configured
- `GET|PUT /api/customer/profile` -> `/bff/customer/profile`
- `GET|PUT /api/application/steps/[step]` -> `/bff/application/steps/{step}`
- `POST /api/application/submit` -> `/bff/application/submit`

`GET|POST|DELETE /api/auth/session` and
`POST /api/auth/session/touch` intentionally stay local in Next for now because
Next still owns the browser-facing auth session cookie and idle-session timing.

`GET /api/security/csrf` intentionally stays local for now so the Next facade
can keep issuing the signed CSRF cookie format it already uses while the BFF
accepts that forwarded cookie on proxied mutations.

When the Next facade proxies mutating routes into the BFF, both processes
should share the same `ACME_WEB_SESSION_SECRET` so signed CSRF cookies validate
end to end.

The customer-profile and application-flow BFF slices now also share the same
state-store contract as the Next facade:

- `ACME_WEB_STATE_STORE=redis` enables Redis-backed BFF state
- `ACME_REDIS_URL=redis://127.0.0.1:6379` is the local connection-string path
- `ACME_REDIS_HOST`, `ACME_REDIS_PORT`, and
  `ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID` drive the ACA + Entra path
- `ACME_REDIS_KEY_PREFIX` is intentionally shared with the Next facade so route
  switches stay reversible and customer/application state survives the handoff

If Redis is not configured, the BFF falls back to in-memory customer and
application state for local scaffolding.

That keeps browser contracts stable while letting the Next facade fall back to
the existing implementation whenever the BFF base URL is not configured.

For the trusted identity bridge, Next forwards authenticated customer context
with `x-acme-authenticated-*` headers. In local development the BFF accepts
those headers to keep the scaffold easy to run. Outside local development, set
the same `ACME_BFF_TRUSTED_PROXY_SECRET` value in the Next facade and the BFF so
the BFF can reject spoofed trusted identity headers unless they came through the
server-side proxy path.

## First Verification Pass

From the repo root:

```powershell
dotnet restore apps/bff-api/Acme.Los.Bff.sln
dotnet build apps/bff-api/Acme.Los.Bff.sln
dotnet test apps/bff-api/Acme.Los.Bff.sln
npx.cmd nx show projects
```

## Notes

- Keep the current browser-facing `/api/*` contract stable during the first BFF
  rollout.
- Move customer and application behavior before moving the full auth callback
  path.
- Do not relayout the repo before the BFF proves its value.

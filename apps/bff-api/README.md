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
          Diagnostics/
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

The `e2e/` folder now contains Reqnroll acceptance coverage. By default it runs
in-process through `WebApplicationFactory<Program>`, and it can also point at a
manually started local BFF by setting `ACME_BFF_E2E_BASE_URL`.

Keep one `.http` file in the API project. It is still one of the fastest ways
to smoke-test health, OpenAPI, auth/session behavior, and feature slices
without booting the whole web experience.
The committed file is
[src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.http](./src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.http);
the manual testing guidance lives in
[HTTP API testing](../../docs/reference/http-api-testing.md).

## Package Direction

The current BFF package surface includes:

- OpenAPI generation
- Scalar UI
- health and readiness endpoints
- structured logging
- OpenTelemetry wiring
- Redis-backed state support
- trusted proxy boundary validation
- optional Entra service-auth validation

Hold these unless the need becomes concrete:

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
routes into the BFF only when you opt in with server-side configuration:

```powershell
$env:ACME_BFF_BASE_URL = 'http://localhost:5186'
$env:ACME_BFF_PROXY_MODE = 'bff'
```

`ACME_BFF_PROXY_MODE` accepts:

- `next`: force the switched routes to stay on the Next implementation
- `bff`: force the BFF implementation and fail if no BFF base URL is configured

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
- `GET /api/security/csrf` -> `GET /bff/security/csrf`
- `GET /api/security/inspector` -> `GET /bff/security/inspector` in BFF mode,
  after the authenticated Next facade and rate-limit checks pass
- `GET /api/auth/start` -> `GET /bff/auth/login`
- `GET /api/auth/callback` -> `GET /bff/auth/callback`
- `GET|PUT /api/customer/profile` -> `/bff/customer/profile`
- `GET|PUT /api/application/steps/[step]` -> `/bff/application/steps/{step}`
- `POST /api/application/submit` -> `/bff/application/submit`
- `POST /api/diagnostics/trace` -> `/bff/diagnostics/trace`

`GET|POST|DELETE /api/auth/session`,
`POST /api/auth/session/touch`, guarded API session checks, server-rendered
session checks, and logout hints use the same `ACME_BFF_PROXY_MODE` switch. In
`next` mode, Next owns the auth session store. In `bff` mode, Next remains the
browser facade but delegates PKCE transaction state, Okta token exchange,
id-token validation, session read/sync/touch/clear, requirement checks, funding
step-up freshness, and logout-hint reads to the BFF. Next still owns the public
redirect routes and writes the browser-facing opaque session cookie from the BFF
session headers. Mock auth remains local for development and Playwright
fixtures.

In `bff` mode, `GET /api/security/csrf` stays browser-facing on the Next
origin but delegates token issuance to the BFF and relays the BFF `Set-Cookie`
header back to the browser. The Next facade accepts both the earlier signed
facade cookie format and BFF-issued raw CSRF tokens so existing local cookies
can roll forward cleanly.

The security inspector follows the same authority rule. In `next` mode it reads
the Next-owned server store. In `bff` mode it reads the BFF-owned store through
`/bff/security/inspector` over the trusted server-to-server boundary. The raw
BFF inspector endpoint is local/dev diagnostics only; browser users should open
`/security` on the Next origin.

The BFF HTTP pipeline owns cross-cutting transport concerns before any Wolverine
handler runs: request completion logging, correlation ID normalization,
correlation response headers, log scopes, and OpenTelemetry tags. Keep auth,
cookie, CSRF, trusted proxy, and route-level HTTP decisions in that HTTP
pipeline. Use Wolverine behind that boundary for authenticated customer and
application commands/queries.

When the Next facade proxies mutating routes into the BFF, the BFF validates the
forwarded CSRF header and cookie before mutating state.

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
the existing implementation whenever the proxy mode is `next`. The BFF base URL
is connection configuration only; it does not act as the rollout switch.

Toggle behavior to preserve:

| Surface              | `ACME_BFF_PROXY_MODE=next` | `ACME_BFF_PROXY_MODE=bff`                            |
| -------------------- | -------------------------- | ---------------------------------------------------- |
| Browser URL          | Next `/api/*`              | Same Next `/api/*`                                   |
| Session authority    | Next web-server store      | BFF auth session store                               |
| CSRF issuer          | Next facade                | BFF, relayed through Next                            |
| Security inspector   | Next-owned snapshot        | BFF-owned snapshot                                   |
| Customer/application | Next implementation        | BFF implementation behind Next                       |
| Browser telemetry    | Next facade logging        | Still Next facade logging                            |
| Diagnostic tracing   | Not proxied                | Next facade calls `/bff/diagnostics/trace` for demos |

For the trusted identity bridge, Next forwards authenticated customer context
with `x-acme-authenticated-*` headers. In local development the BFF accepts
those headers to keep the scaffold easy to run. Outside local development, set
the same `ACME_BFF_TRUSTED_PROXY_SECRET` value in the Next facade and the BFF so
the BFF can reject spoofed trusted identity headers unless they came through the
server-side proxy path.

For Azure environments that have an Entra BFF API audience, set
`bffRuntime.serviceAuth.mode` to `entra` in the environment config. The Next
facade then adds a managed-identity `Authorization: Bearer` token for the
configured `ACME_BFF_SERVICE_AUTH_SCOPE`, and the BFF validates tenant,
audience, and allowed caller before `/bff/*` routes run. Keep the trusted proxy
secret enabled with service auth so trusted identity headers require both the
service identity token and the server-side proxy secret.

Browser-origin operational telemetry follows the same facade rule. The browser
continues posting to `/api/observability/events`; the Next facade enforces rate
limit and CSRF checks, validates the allowlisted payload, and writes the
structured log event through the shared logger. The BFF diagnostic tracing route
is separate on purpose: `/api/diagnostics/trace` makes a real server-to-server
call to `/bff/diagnostics/trace` so demos can show trace propagation without
turning browser log ingestion into a BFF responsibility.

In Azure, the BFF ACA app is internal to the Container Apps environment. The
public smoke path is the Next facade, especially `/api/health`. A direct BFF
FQDN from a workstation can time out because it is not a public browser/API
endpoint. BFF replica counts follow the environment runtime scale settings by
default unless the environment config adds a dedicated `bffRuntime` override.
Dev enables Entra service auth for the BFF through that same `bffRuntime`
configuration so the server-to-server boundary remains source-owned.

## First Verification Pass

From the repo root:

```powershell
dotnet restore apps/bff-api/Acme.Los.Bff.sln
dotnet build apps/bff-api/Acme.Los.Bff.sln
dotnet test apps/bff-api/Acme.Los.Bff.sln
npm run dotnet:audit
npx.cmd nx show projects
```

## Notes

- Keep the current browser-facing `/api/*` contract stable during the first BFF
  rollout.
- Move customer and application behavior before moving the full auth callback
  path.
- Do not relayout the repo before the BFF proves its value.

# BFF Implementation Status

This page used to be the first-pass BFF checklist. The first pass has now
landed, so this document records what is implemented and what remains.

Related docs:

- [BFF rollout plan](./bff-rollout-plan.md)
- [Current platform architecture](./current-platform.md)
- [Auth and API contracts](./auth-and-api-contracts.md)
- [ACME LOS BFF README](../../apps/bff-api/README.md)

## Current Status

The BFF is real and source-owned:

- `.NET 10` Minimal API under [apps/bff-api](../../apps/bff-api)
- Nx-discovered build, test, run, publish, and release surfaces
- xUnit coverage plus Reqnroll/Gherkin acceptance coverage
- internal Azure Container App deployment behind the public Next facade
- Redis-backed state in Azure/local hardened paths, with in-memory fallback for
  lightweight scaffolding
- real Okta-backed auth/session, CSRF, customer, and application routes owned by
  the BFF behind the stable Next facade
- optional Entra managed-identity service auth through
  `bffRuntime.serviceAuth.mode=entra`

The browser contract remains unchanged: browser code calls the Next `/api/*`
facade, and the Next server layer delegates real Okta-backed behavior to the
BFF. Explicit mock auth remains local for development and Playwright fixtures.

## Implemented Endpoint Surface

### Operational

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /bff/health`
- `GET /openapi/v1.json` in development
- Scalar UI in development

### Auth And Session

- `GET /bff/auth/login`
- `GET /bff/auth/callback`
- `POST /bff/auth/logout`
- `GET /bff/auth/session`
- `DELETE /bff/auth/session`
- `POST /bff/auth/session/touch`
- `POST /bff/auth/session/requirement`
- `GET /bff/auth/logout-hint`

### Security

- `GET /bff/security/csrf`
- `GET /bff/security/inspector`

### Customer

- `GET /bff/customer/profile`
- `PUT /bff/customer/profile`

### Application

- `GET /bff/application/steps/{step}`
- `PUT /bff/application/steps/{step}`
- `POST /bff/application/submit`

### Diagnostics

- `POST /bff/diagnostics/trace`

The diagnostic trace route exists for local/dev support and the logging demo.
The browser still posts operational telemetry to `/api/observability/events`;
the Next facade logs that allowlisted telemetry directly. The separate
`/api/diagnostics/trace` facade route calls `/bff/diagnostics/trace` to prove
Next-to-BFF correlation, traceparent propagation, CSRF validation, and the
trusted proxy boundary on a real API hop.

## Security Boundary

Current layers:

- raw BFF ACA ingress is internal in Azure
- browser traffic stays on the Next origin
- trusted identity headers require `ACME_BFF_TRUSTED_PROXY_SECRET` outside
  local development
- optional Entra service auth requires a managed-identity bearer token before
  `/bff/*` routes run
- security inspector is local/dev by default and opt-in elsewhere

Recommended production path:

1. use Microsoft Graph Bicep to create the BFF API app registration, enterprise
   application, and managed-identity app role assignment per environment
2. configure `bffRuntime.serviceAuth.mode=entra`; `dev` already does this
3. validate the Next managed identity as the allowed caller
4. keep the trusted proxy secret enabled as defense-in-depth for identity
   headers
5. add private-origin edge hardening with Front Door/WAF after environment
   promotion is repeatable

## Current Nx And .NET Commands

```powershell
npx.cmd nx run Acme.Los.Bff.Api:build
npx.cmd nx run Acme.Los.Bff.Api:run
npx.cmd nx run Acme.Los.Bff.Api:publish
npx.cmd nx run Acme.Los.Bff.Api.Tests:test
npx.cmd nx run Acme.Los.Bff.Api.E2E:test
dotnet test apps/bff-api/Acme.Los.Bff.sln
dotnet format apps/bff-api/Acme.Los.Bff.sln --verify-no-changes
```

## Remaining Work

- prove `qa` with the same BFF, Redis, Key Vault, Okta, and monitoring shape as
  `dev`
- enable and verify `bffRuntime.serviceAuth.mode=entra` in `qa`, `stg`, and
  `prod` after each environment's Entra BFF audience and token scope exist
- move customer/application persistence from transitional state into durable
  backend-owned storage
- decide when the BFF deserves its own independent runtime promotion lane
- add production edge controls: Front Door, WAF, stable custom domains, and
  private-origin ACA access
- keep direct raw BFF usage limited to local/dev terminal or diagnostics paths

## Verification Baseline

Use the normal repo sweep before promotion:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
dotnet test apps/bff-api/Acme.Los.Bff.sln
```

For Azure/runtime changes, add:

```powershell
az bicep build --file infra/azure/bicep/main.web.runtime.rg.bicep
az bicep build --file infra/azure/bicep/modules/web/container-app.bicep
az bicep build --file infra/azure/bicep/modules/bff/container-app.bicep
```

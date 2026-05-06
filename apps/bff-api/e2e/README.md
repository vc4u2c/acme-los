# ACME LOS BFF E2E

This folder contains Reqnroll/Gherkin acceptance coverage for the BFF API.

The default test mode uses `WebApplicationFactory<Program>` so CI can run the
scenarios without a separate process. To point the same scenarios at a manually
started local BFF, set:

```powershell
$env:ACME_BFF_E2E_BASE_URL = 'http://localhost:5186'
$env:ACME_BFF_TRUSTED_PROXY_SECRET = 'acme-los-local-dev-bff-proxy-secret'
dotnet test apps/bff-api/e2e/Acme.Los.Bff.Api.E2E/Acme.Los.Bff.Api.E2E.csproj
```

Keep browser journeys in Playwright. Use Reqnroll here for API/business
acceptance scenarios where Gherkin helps describe the behavior:

- route smoke tests for `/health/*`, `/bff/health`, and `/openapi/v1.json`
- contract checks for `customer` and `application` slices
- Redis-backed and auth-bridge coverage when the local stack includes the Next
  facade and shared session/CSRF configuration

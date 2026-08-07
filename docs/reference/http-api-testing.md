# HTTP API Testing

Use the VS Code REST Client extension for the committed `.http` checks:

- workspace recommendation: `humao.rest-client`
- primary request file:
  [apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.http](../../apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.http)

The file is intentionally for local and dev manual checks. It is not a place to
store Okta tokens, browser cookies, production secrets, or copied customer data.

## Local Stack

Start the full local web + BFF stack:

```powershell
npx.cmd nx run web-app:dev-stack
```

Then run requests from the `.http` file:

- `GET {{WebHost}}/api/health`
- `GET {{WebHost}}/api/security/csrf`
- `GET {{BffHost}}/bff/health`
- `GET {{BffHost}}/openapi/v1.json`
- `GET {{BffHost}}/bff/customer/profile`
- `PUT {{BffHost}}/bff/customer/profile`
- `GET|PUT {{BffHost}}/bff/application/steps/personal-info`

The browser-facing contract remains the Next origin. Direct BFF requests are
for terminal, REST Client, or e2e-style diagnostics.

## Trusted Local Headers

The BFF only honors trusted identity headers when the trusted proxy boundary is
present.

Local REST Client checks use:

```http
x-acme-bff-proxy-secret: {{TrustedProxySecret}}
x-acme-authenticated-user-id: {{UserId}}
x-acme-authenticated-user-email: {{UserEmail}}
x-acme-authenticated-customer-id: {{CustomerId}}
x-acme-authenticated-lead-id: {{LeadId}}
```

The local default `TrustedProxySecret` in the `.http` file matches the local
development default used by the one-command stack. Do not replace it with an
Azure or production value.

Entra service-auth bearer tokens are not part of the normal committed REST
Client file. If `ACME_BFF_SERVICE_AUTH_MODE=entra` is enabled for a manual BFF
test, keep the bearer token in a private scratch file and never commit it.

## CSRF Flow

The REST Client file names the BFF CSRF request:

```http
# @name bffCsrf
GET {{BffHost}}/bff/security/csrf
```

Mutating BFF requests reuse the response body token:

```http
x-csrf-token: {{bffCsrf.response.body.$.csrfToken}}
```

REST Client keeps the matching local cookie for the same host, which exercises
the double-submit shape without copying the token by hand.

For the browser path, call the Next facade instead:

```http
GET {{WebHost}}/api/security/csrf
```

That Next route delegates issuance to the BFF and relays the browser cookie
through the stable web origin.

## Azure Dev

The public manual path is the web container app:

```http
GET {{DevWebHost}}/api/health
```

The BFF container app is internal to the ACA environment, so workstation
requests should not target the raw BFF FQDN in Azure. Use the Next `/api/*`
facade and the `/security` page for authenticated local/dev inspection.

## Authenticated Browser Testing

Use the browser for the app-owned Okta IDX sign-in, session, logout, and
security inspector flows:

- local: `http://localhost:3000/security`
- dev:
  `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io/security`

Do not paste real `Cookie`, `Authorization`, Okta id token, access token, or
refresh token values into `.http` files. If a temporary manual request requires
live browser cookies, keep it outside the repo in a private scratch file and
delete it after the check.

## Swagger And OpenAPI

For local direct BFF API discovery:

```http
GET {{BffHost}}/openapi/v1.json
```

When the BFF is running in development, Scalar/OpenAPI UI routes may also be
available from the direct local BFF host. Keep browser application code on the
Next `/api/*` facade even when exploring the raw OpenAPI contract locally.

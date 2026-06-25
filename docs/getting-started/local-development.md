# Local Development

This is the practical local run path for the repo.

For the day-to-day Nx command set beyond the basics here, see [workspace-commands.md](./workspace-commands.md).

## Prerequisites

- Node.js `24.14.0`
- npm
- Windows PowerShell or a Unix-like shell
- Docker Desktop if you want the Redis-backed local web-state path

Install dependencies:

```powershell
npm install
```

## Run The Web App

Default local web state uses the file-backed server store. This is enough for normal UI work and for exercising the hardened auth flow without Docker.

```powershell
npx.cmd nx run web-app:dev
```

Open:

- `http://localhost:3000`

### Run The Redis-Backed Web Path

```powershell
npx.cmd nx run web-app:dev-redis
```

That command:

- starts Redis with Docker Compose
- sets `ACME_WEB_STATE_STORE=redis`
- sets `ACME_REDIS_URL=redis://127.0.0.1:6379`
- starts `web-app:dev`

Pass normal dev-server options after `--`:

```powershell
npx.cmd nx run web-app:dev-redis -- --port=4200
```

Stop local Redis:

```powershell
npx.cmd nx run web-app:redis-down
```

Manual fallback if Docker is unavailable:

```powershell
$env:ACME_WEB_STATE_STORE='file'
npx.cmd nx run web-app:dev
```

## Run The Web App And BFF Together

The BFF hop is server-side. The browser keeps calling the stable Next.js
`/api/*` routes, and real Okta-backed route handlers proxy selected requests
to the BFF when `ACME_BFF_BASE_URL` is configured. Explicit mock auth remains
local for tests and lightweight UI work.

### Preferred One-Command Path

Use this for the full local website path. It starts Redis, the `.NET` BFF, and
the Next web app with BFF proxying configured.

```powershell
npx.cmd nx run web-app:dev-stack
```

Open:

- `http://localhost:3000`
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/health/live`
- `http://localhost:5186/bff/health`

The one-command local stack uses `http://localhost:5186` for Next-to-BFF
server-side proxy traffic. That avoids local Node.js TLS trust issues with the
ASP.NET Core self-signed HTTPS development certificate. Browser application code
should still call the stable Next facade, for example `/api/health`, not the raw
BFF URL. When the BFF is configured, `/api/health` reports both the Next web
layer and the BFF layer. The raw BFF URL is for terminal checks or direct
top-level navigation.
Use `/api/security/csrf` on the Next origin for browser-facing CSRF tokens;
that route delegates issuance to `/bff/security/csrf` server-side and relays
the cookie back through the Next response.
Open `/security` on the Next origin for the security inspector. With real Okta
auth it shows the BFF-owned token/session state through the authenticated Next
facade; with explicit mock auth it shows a token-free local snapshot.
If you need to override the one-command BFF URL, set
`ACME_DEV_STACK_BFF_BASE_URL`; the script passes that value to the web app as
`ACME_BFF_BASE_URL`.

The npm alias is:

```powershell
npm run web:dev:stack
```

### Manual Split-Terminal Path

Use this when you want separate terminals for debugging either process.

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

When you are done with the local Redis container:

```powershell
npx.cmd nx run web-app:redis-down
```

If you set `ACME_WEB_SESSION_SECRET`, set the same value in both terminals. In
normal local development, both processes fall back to the same local
non-production secret automatically.

For the trusted Next-to-BFF identity handoff, set the same
`ACME_BFF_TRUSTED_PROXY_SECRET` value in both terminals when you want local dev
to match the production guard. The one-command stack sets a local default for
both processes. Outside development, the BFF must require that shared secret or
an equivalent private network boundary before it honors trusted identity
headers.

Managed-identity service auth is an Azure hardening layer, not a normal local
developer requirement. Leave `ACME_BFF_SERVICE_AUTH_MODE` unset locally unless
you are explicitly testing Entra token validation with a configured BFF
audience and token scope.

## Run The Mobile App

Start Expo:

```powershell
npx.cmd nx run mobile-app:start
```

Useful mobile targets:

```powershell
npx.cmd nx run mobile-app:serve
npx.cmd nx run mobile-app:run-android
npx.cmd nx run mobile-app:run-ios
```

## Run Verification

Full local verification:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

Focused verification:

```powershell
npx.cmd nx run-many -t lint test --all
npx.cmd nx run-many -t e2e --all
```

You can also run project-specific targets directly:

```powershell
npx.cmd nx run web-app:lint
npx.cmd nx run web-app:test
npx.cmd nx run mobile-app:start
```

## When Auth Matters

If you are only working on public UI or shared libraries, the commands above are usually enough.

If you need any of these, also complete the Okta setup in [infra/okta/README.md](../../infra/okta/README.md):

- hosted sign-in or registration
- guarded `/apply/*` routes
- MFA and funding step-up flows
- customer dashboard and signed-in profile behavior

### Security Inspector

The `/security` route is available by default in `local` and `dev`.

For `qa`, `stg`, and `prod`, it stays opt-in only.

To force it on anywhere:

```powershell
$env:ACME_ENABLE_SECURITY_INSPECTOR='true'
npx.cmd nx run web-app:dev
```

To force it off even in `local` or `dev`, add this to `apps/web-app/.env.local`:

```text
ACME_ENABLE_SECURITY_INSPECTOR=false
```

Security inspector authority expectations:

| Setting                   | What `/security` shows                    |
| ------------------------- | ----------------------------------------- |
| Real Okta auth            | BFF-owned auth/session and token snapshot |
| `ACME_AUTH_PROVIDER=mock` | token-free local mock snapshot            |

The raw BFF inspector route is for server-to-server local/dev diagnostics. Do
not use it from browser application code.

## Notes

- On Windows, `npx.cmd nx ...` is safer than `npx nx ...`
- `apps/web-app/next-env.d.ts` is generated by Next.js and may flip between dev/build route type paths
- local web state uses Redis or a file-backed fallback under `.next/cache/acme-los-web-state`

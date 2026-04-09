# ACME LOS Agent Guide

This repository is a lending experience monorepo with:

- `apps/web-app`: Next.js 16 web app
- `apps/mobile-app`: Expo 55 mobile app
- `infra/azure`: Azure landing zone and ACA deployment assets
- `infra/okta`: Okta environment manifests and bootstrap tooling

## Priorities

1. Keep auth and session behavior correct before optimizing UX polish.
2. Treat Azure, Okta, and deployment changes as infrastructure work first, not one-off portal fixes.
3. Keep docs aligned with the real deployed state, especially for `dev`.
4. Favor small, reversible changes that preserve promotion safety.

## Verification

Before promotion, prefer this full sweep:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue
Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue
npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

## Frontend Direction

- Preserve the existing intentional visual design; avoid generic SaaS UI.
- Keep environment and build visibility clear in non-prod.
- For Next.js work, respect the current server/client split and avoid pushing business logic into route handlers unless it truly belongs there.

## Platform Direction

- `dev` currently runs on Azure Container Apps with Redis, Key Vault, private endpoints, and platform-owned monitoring.
- Prefer changes through Bicep, scripts, and workflows over portal-only edits.
- If live Azure state is patched manually to unblock debugging, fold that back into source control quickly.

## Skills To Prefer

This repo includes a curated subset of Codex skills under `.agents/skills` for:

- frontend design and patterns
- Next.js / Turbopack
- E2E testing
- backend and API patterns
- documentation lookup
- security review
- verification loops

Use them when the task clearly matches.

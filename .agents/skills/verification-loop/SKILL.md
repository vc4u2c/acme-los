---
name: verification-loop
description: ACME LOS verification workflow for code, auth/session, frontend, mobile, Azure/IaC, GitHub PR promotion, and major-change readiness. Use before opening or merging PRs, after significant implementation, when debugging GitHub Actions, or whenever the user asks to verify, promote, release, run checks, run E2E, lint, test, build, or avoid hacks.
---

# Verification Loop

Use this skill to prove ACME LOS changes are ready instead of relying on local reasoning alone. Prefer the narrowest verification that covers the risk, then expand when the change crosses app, auth, deployment, or release boundaries.

## Baseline Rules

- Start from a clean understanding of `git status --short --branch`; do not revert unrelated user work.
- Run `prettier`, `lint`, and `test` before PR/promotion unless the user explicitly asks for a smaller check.
- For auth/session/security changes, include a web build and web E2E when feasible.
- For major changes, run the full repo sweep below before promotion.
- If a check cannot run because of sandboxing, missing credentials, a live dependency, or time, say exactly what was skipped and why.
- Treat a failing check as work to fix, not a report to hand back, unless the failure is clearly unrelated or requires user credentials.

## Quick Local Sweep

Use for narrow docs, copy, or low-risk single-area code edits:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
```

## Web/Auth Sweep

Use for Next.js, web UI, auth, claims, cookies, session, Redis-backed state, CSRF, customer profile, or application-flow changes:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue
Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue
npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

Check the behavior manually or with Playwright when the user reported a live UX issue.

## Mobile Sweep

Use when `apps/mobile-app`, shared mobile UI, Expo config, or mobile auth behavior changes:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
```

## Azure And Deployment Sweep

Use for Bicep, ACA, Redis, Key Vault, GitHub OIDC, workflow, or deployment script changes:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
az bicep build --file infra/azure/bicep/main.web.rg.bicep
az bicep build --file infra/azure/bicep/main.web.monitoring.rg.bicep
```

After merge/deploy, verify the live `dev` app when credentials are available:

```powershell
gh run list --repo vc4u2c/acme-los --branch main --limit 10
gh run watch <run-id> --repo vc4u2c/acme-los --interval 30 --exit-status
az containerapp show --subscription <sub> --resource-group <rg> --name <app> --output json
Invoke-WebRequest -UseBasicParsing -Uri <dev-health-url> -TimeoutSec 120
```

Confirm health `version`, `build`, image tag, environment, Redis auth mode, and any runtime settings touched by the change.

## Major Change Sweep

Use this when a change affects more than one subsystem, auth/session, deployment/release, data handling, or any user-visible production path:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue
Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue
npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

Add Azure Bicep builds for infrastructure changes and live `dev` verification after promotion.

## GitHub PR And Promotion

- Before opening a PR: run the applicable local sweep, review `git diff --check`, and inspect changed files for secrets or unrelated churn.
- After opening a PR: watch GitHub checks with `gh pr checks --watch` or `gh run watch`; inspect logs before changing code.
- Before merge: ensure required checks pass and summarize any skipped local checks.
- After merge to `main`: watch CI/CD, verify the deployed `dev` revision, and sync local `main`.
- If an environment does not exist, keep the workflow aligned with real environments instead of leaving a permanent blocked gate.

## Report Format

Use a short readiness report:

```text
Verification:
- Prettier: pass/fail/skipped
- Lint/tests: pass/fail/skipped
- Build: pass/fail/skipped
- E2E: pass/fail/skipped
- Deployment/live check: pass/fail/skipped

Result: ready/not ready
Notes: blockers, skipped checks, residual risk
```

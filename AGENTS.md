# ACME LOS Agent Guide

## Start Here

1. Run `npm.cmd run harness:context` before broad repository discovery.
2. Read only the owner documents it lists, plus the nearest scoped `AGENTS.md` for files being changed.
3. Use `git ls-files` and `rg`; exclude generated and ignored directories such as `node_modules`, `.next`, `.nx`, `dist`, `coverage`, and `tmp`.
4. Keep each change small enough to review as one coherent security or product increment.
5. Run `npm.cmd run agents:verify` after changing agent instructions, skills, adapters, project agents, or harness routing.

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

## Owner Documents

- Current runtime: `docs/architecture/current-platform.md`
- Auth and API contracts: `docs/architecture/auth-and-api-contracts.md`
- Next server/client boundary: `docs/architecture/web-server-client-boundaries.md`
- Visual direction: `docs/architecture/visual-design-system.md`
- Agent context and review controls: `docs/architecture/agent-harness.md`
- Change safety: `docs/architecture/change-safety-workflow.md`
- Okta account security: `docs/operations/okta-account-security-and-profile-sync.md`
- Azure lifecycle: `docs/operations/azure-bootstrap-and-teardown.md`
- Release and delivery: `docs/operations/release-and-delivery.md`

Update the owner document instead of repeating durable decisions elsewhere.

## Non-Negotiable Boundaries

- Derive user, customer, lead, and authorization scope from validated server state.
- Keep OAuth tokens, credentials, OTPs, and transaction secrets out of browser storage, logs, fixtures, and commits.
- Enforce auth, subject continuity, assurance, CSRF, and scope at the BFF boundary; client filtering is UX only.
- Use Key Vault references and managed identities for secrets and Azure access.
- Keep analytics and telemetry free of personal, customer, credential, and form data.
- Treat Okta, Azure, user deletion, deployment, and destructive cleanup as explicit operations, never implicit review actions.

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
- analytics and GA4/GTM setup
- documentation maintenance
- dependency vulnerability management for npm and NuGet audit findings
- security review
- read-only adversarial codebase review
- agent harness and context routing
- verification loops
- karpathy-guidelines for broad, ambiguous, architectural, or security-sensitive
  work where scope control and verification discipline matter

Use them when the task clearly matches.

## Agentic Development Model

- Keep reusable domain workflow knowledge in `.agents/skills`; load only the
  matching skill for the current work.
- Codex project agents are configured in `.codex/config.toml` with narrow
  specialist roles, a four-thread cap, and a one-level delegation depth.
- Use `explorer`, `docs_researcher`, `reviewer`, and `frontend_designer` only
  for bounded parallel work that provides evidence or an independent check;
  keep implementation on the main path unless a worker owns a disjoint slice.
- Claude adapters under `.claude` mirror this model without duplicating the
  canonical skill instructions.
- Run `npm run agents:verify` after adding or changing a skill or project
  agent.

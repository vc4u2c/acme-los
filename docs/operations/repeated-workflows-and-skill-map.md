# Repeated Workflows And Skill Map

This is the lightweight map of the work that keeps coming up in this repo and
the skills that should get sharper over time.

## Repeated Workflows

### Azure Lifecycle

Common requests:

- show whether `dev` is running
- pause, resume, or restart Azure
- confirm the live health response after deploy
- keep portal changes from drifting away from source

Use:

- `npm run azure:show-state -- -EnvironmentName dev`
- `npm run azure:pause:web -- -EnvironmentName dev`
- `npm run azure:resume:web -- -EnvironmentName dev`
- public health: `/api/health`

Skill to use and improve:

- `azure-landing-zone-and-aca`

### PR, Promotion, Merge, And Branch Cleanup

Common requests:

- promote a change
- merge the PR
- check CI/CD
- sync `main`
- delete local branches except `main`

Use:

- `git status --short --branch`
- `gh pr checks --watch` or `gh run watch`
- `git fetch --prune origin`
- `git switch main`
- `git pull --ff-only`
- delete only merged or explicitly abandoned local feature branches

Skill to use and improve:

- `github-pr-and-actions`
- `verification-loop`

### BFF Toggle, Telemetry, And Service Auth

Common requests:

- confirm which routes are implemented in the BFF
- keep `ACME_BFF_PROXY_MODE=next|bff` behavior reversible
- move telemetry slices behind the BFF toggle
- harden Next-to-BFF with managed identity

Use:

- `ACME_BFF_PROXY_MODE=next|bff`
- `ACME_BFF_OBSERVABILITY_EVENTS_ENABLED=true|false`
- `bffRuntime.serviceAuth.mode=entra` only after the Entra BFF audience and
  token scope exist
- keep `ACME_BFF_TRUSTED_PROXY_SECRET` as defense-in-depth for trusted identity
  headers

Skills to use and improve:

- `security-review`
- `backend-patterns`
- `azure-landing-zone-and-aca`
- `verification-loop`

### GA4/GTM Analytics

Common requests:

- create or check GA/GTM setup
- document manual Google admin steps
- confirm Realtime activity
- add journey milestones and key-event candidates
- separate product analytics from Azure operational telemetry

Use:

- `infra/analytics/environments/*.json`
- `infra/analytics/events.json`
- `npm run analytics:render -- <env>`
- `npm run analytics:admin-plan -- <env>`

Skill improvement candidate:

- `analytics-and-gtm`
- use `security-review` with it for sensitive telemetry rules
- use `verification-loop` with it for code/runtime checks

### Vulnerability And Dependency Sweeps

Common requests:

- fix npm audit findings
- check BFF NuGet vulnerabilities
- keep overrides narrow and documented

Use:

- `npm.cmd audit --audit-level=moderate`
- `npm run dotnet:audit`
- prefer scoped `overrides` and lockfile updates over broad dependency churn

Skills to use and improve:

- `security-review`
- `verification-loop`

### Demo And Architecture Documentation

Common requests:

- keep the demo inventory current
- explain every capability by category
- clarify what is live, source-supported, or future work

Use:

- [Azure and website demo runbook](./azure-and-website-demo-runbook.md)
- [Current platform architecture](../architecture/current-platform.md)
- [Enterprise readiness](../architecture/enterprise-readiness.md)
- [Tech stack and tooling](../reference/tech-stack.md)

Skill to use and improve:

- `docs-maintenance`
- `verification-loop` for docs/source consistency checks

## Skills Improved In This Pass

- `azure-landing-zone-and-aca`: added repeated Azure lifecycle, BFF runtime, and
  service-auth guidance.
- `github-pr-and-actions`: added the common promote, merge, CD, sync, and branch
  cleanup flow.
- `verification-loop`: added BFF service-auth, Bicep module, .NET BFF, and
  docs/skill sweep verification guidance.
- `security-review`: added service-to-service managed-identity auth checks.
- `analytics-and-gtm`: added a dedicated GA4/GTM product analytics workflow.
- `docs-maintenance`: added a dedicated doc inventory, stale-claim review, and
  formatting workflow for repo-wide Markdown cleanup.

## Next Skill Candidate

The next useful skill candidate is an ACME LOS dependency-maintenance skill:

- trigger on "vulnerabilities", "npm audit", "NuGet audit", or "dependency
  sweep"
- inspect package manager output before changing versions
- keep overrides narrow, documented, and removable
- pair dependency changes with the verification loop for affected packages

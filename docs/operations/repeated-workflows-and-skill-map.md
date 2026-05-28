# Repeated Workflows And Skill Map

This is the lightweight map of the work that keeps coming up in this repo and
the skills that should get sharper over time.

## Agentic Development Model

The repo uses one canonical source for reusable task knowledge:
`.agents/skills/<name>/SKILL.md`. Codex loads the applicable skill body only
when the task matches it, which keeps general context small while preserving
repo-specific accuracy. Claude wrappers under `.claude/skills` point back to
the same canonical bodies instead of copying their instructions.

All current skills are guidance and verification skills. They remain available
for both automatic selection and explicit developer invocation. A future skill
that directly performs an irreversible action, such as a publish or merge
command, should be manual-only rather than automatically invoked.

Specialist agents are for bounded work that can proceed beside the main path:

| Logical role        | Use for                                          | Codex                  | Claude                  |
| ------------------- | ------------------------------------------------ | ---------------------- | ----------------------- |
| Explorer            | Read-only execution-path and impact tracing      | `explorer`             | `explorer`              |
| Reviewer            | Independent correctness and security review      | `reviewer`             | `reviewer`              |
| Docs researcher     | Current primary-documentation verification       | `docs_researcher`      | `docs-researcher`       |
| Frontend designer   | Visual and responsive implementation polish      | `frontend_designer`    | `frontend-designer`     |
| Implementation work | Disjoint, explicitly owned implementation slices | built-in `worker` role | `implementation-worker` |

Codex is configured in `.codex/config.toml` with `max_threads = 4` and
`max_depth = 1`; the cap prevents unbounded fan-out and repeated context costs.
Do not delegate critical-path work merely to look agentic. Delegate targeted
research, review, or disjoint implementation only when it shortens the path or
adds a meaningful independent check.

After changing a skill or agent adapter, run:

```powershell
npm run agents:verify
```

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
- `karpathy-guidelines` when the request is broad enough that scope control
  matters

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

- `karpathy-guidelines`
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
- `bffRuntime.serviceAuth.mode=entra`; in `dev`, the deploy path creates or
  updates the Entra BFF audience and web managed-identity app role assignment
  through Microsoft Graph Bicep
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
- `npm.cmd audit --json`
- `npm.cmd run audit:node` for the Node CI gate
- `npm.cmd ls <package>`
- `npm.cmd run dotnet:audit` for readable NuGet triage output
- `npm.cmd run dotnet:audit:ci` for the NuGet CI gate, including transitive
  dependencies at moderate-or-higher severity
- prefer patched transitive lockfile updates when the existing semver range
  allows them
- prefer scoped direct dependency upgrades when the patched version is outside
  the existing range
- avoid `npm audit fix --force` unless the breaking-change risk is explicitly
  accepted

Skills to use and improve:

- `dependency-vulnerability-management`
- `karpathy-guidelines`
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
- `karpathy-guidelines`: added concise ACME working rules for broad, ambiguous,
  architectural, and security-sensitive changes.
- `security-review`: tightened dependency-vulnerability handling around
  advisory inspection, transitive-path tracing, lockfile-only fixes, and
  avoiding broad forced upgrades.
- `dependency-vulnerability-management`: added a dedicated npm and NuGet
  vulnerability scan, triage, fix, verification, and PR-reporting workflow.

## Next Skill Candidate

The next useful skill candidate is an ACME LOS release-readiness skill:

- trigger on "ready to promote", "enterprise ready", "release candidate", or
  "ship it"
- combine PR checks, dependency audit, Azure state, health verification, docs,
  and manual-smoke guidance into one concise readiness report

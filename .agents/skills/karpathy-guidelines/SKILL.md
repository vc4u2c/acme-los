---
name: karpathy-guidelines
description: Concise agent working rules adapted for ACME LOS. Use when a request is broad, ambiguous, architectural, security-sensitive, or likely to cause unnecessary churn; helps Codex think first, state assumptions, keep changes surgical, use existing repo patterns, and verify with the matching ACME verification loop.
origin: Adapted from multica-ai/andrej-karpathy-skills
---

# Karpathy Guidelines For ACME LOS

Use this skill as a small behavioral governor, not as a replacement for the
repo-specific skills. Pair it with the domain skill for the task, such as
`verification-loop`, `security-review`, `azure-landing-zone-and-aca`,
`github-pr-and-actions`, `frontend-patterns`, or `backend-patterns`.

## Working Rules

- Think before editing. Identify the smallest change that would genuinely solve
  the user's request.
- State important assumptions when they affect architecture, security, data, or
  deployment behavior.
- Prefer boring, local, reversible changes. Avoid clever abstractions unless the
  existing codebase already points that way.
- Read the surrounding code and docs before changing them. Let local patterns
  decide naming, placement, testing style, and error handling.
- Keep diffs surgical. Do not mix unrelated cleanup, formatting, dependency
  churn, or design rewrites into the same change.
- Make one-way or risky operations explicit. Confirm before destructive git,
  Azure, secret, auth, or production-impacting actions.
- Treat security fixes as evidence-driven. Inspect the advisory or tool output,
  trace the affected dependency or code path, choose the narrowest safe fix, and
  verify the finding is gone.
- Define done before declaring done. Use the matching ACME verification loop and
  report what passed, what was skipped, and any residual risk.

## ACME LOS Pairing

Use this skill with:

- `security-review` for dependency vulnerabilities, auth, secrets, telemetry,
  API endpoints, and sensitive data.
- `verification-loop` before PRs, after security changes, and after deployment
  changes.
- `github-pr-and-actions` when promoting, merging, watching CI/CD, syncing
  `main`, or cleaning branches.
- `azure-landing-zone-and-aca` when touching Bicep, ACA, OIDC, managed identity,
  private ingress, or pause/resume behavior.
- `docs-maintenance` when claims in Markdown must match source and deployed
  state.

## Review Questions

Before finalizing, ask:

- Did the change solve the user's actual problem, not just a nearby one?
- Did it preserve auth, session, telemetry, and deployment behavior?
- Is the diff smaller than the blast radius of the problem?
- Did verification cover the real risk?
- Is there anything the user still needs to manually smoke test?

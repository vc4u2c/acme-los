---
name: github-pr-and-actions
description: ACME LOS GitHub PR, Actions, CI/CD, release, and promotion workflow. Use when inspecting PRs, opening or merging PRs, debugging failed checks, watching Actions, validating deploy artifacts, syncing main, deleting merged branches, or confirming dev deployment after GitHub workflows.
---

# GitHub PR And Actions

Use this skill with the `verification-loop` skill. GitHub work is not done when code is pushed; it is done when the right checks have run, the PR is merged safely, and the real `dev` deployment is verified when deployment is in scope.

## Local Before PR

- Check `git status --short --branch` first and preserve unrelated user work.
- Run the verification sweep that matches the change risk:
  - narrow change: `prettier`, `lint`, `test`
  - web/auth/session: add `web-app:build` and `web-app-e2e:e2e`
  - infrastructure/deployment: add Bicep builds and deploy-script validation
  - major change: run the full sweep from `verification-loop`
- Run `git diff --check`.
- Inspect the final diff for secrets, generated churn, and files outside the request.

## PR Checks

- Use `gh pr checks --watch` or `gh run watch` for live checks.
- If a check fails, inspect logs before editing.
- Do not guess from a red check name when logs are available.
- Keep Node/action deprecation warnings separate from blocking failures.
- Report skipped checks plainly with the reason.

## Merge And Promotion

- Merge only after required checks pass or the user explicitly accepts a documented risk.
- After merge, sync local `main` with `git fetch --prune origin`, `git switch main`, and `git pull --ff-only`.
- Delete only merged/stale local branches that are no longer needed.
- Watch main CI/CD when deployment matters.
- If an environment does not exist, align the workflow with real environments rather than leaving a permanent blocked gate.

## Deployment Artifact Checks

For release/deploy changes, verify that artifact metadata, checkout ref, image tag, and app health agree:

```powershell
gh run list --repo vc4u2c/acme-los --branch main --limit 10
gh run watch <run-id> --repo vc4u2c/acme-los --interval 30 --exit-status
az containerapp show --subscription <sub> --resource-group <rg> --name <app> --output json
Invoke-WebRequest -UseBasicParsing -Uri <dev-health-url> -TimeoutSec 120
```

Confirm at least:

- GitHub release version
- deploy artifact source SHA
- ACA image tag
- `APP_BUILD_ID`
- `/api/health` `version`, `build`, and `environment`

## Output

Lead with the current state:

```text
PR: open/merged/not opened
Checks: pass/fail/in progress/skipped
Deployment: verified/not applicable/not verified
Local main: synced/not synced
Branches: cleaned/not cleaned
Next: one concrete action
```

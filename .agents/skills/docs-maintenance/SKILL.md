---
name: docs-maintenance
description: ACME LOS documentation maintenance workflow. Use when updating Markdown docs, making docs intuitive and accurate, doing a repo-wide documentation pass, refreshing demo inventories, or reconciling docs with code, IaC, workflows, and deployed state.
---

# Docs Maintenance

Use this skill when documentation is the product of the task, not an afterthought.
Keep current-state claims tied to source-controlled evidence and make reader
paths obvious.

## Read First

- `AGENTS.md`
- `docs/README.md`
- `README.md`
- `docs/reference/tech-stack.md`
- the docs closest to the subsystem being changed
- the matching code, IaC, workflow, or package readme before rewriting behavior
  claims

## Common Workflow

1. Inventory tracked Markdown:

```powershell
git ls-files *.md
```

2. Check the working tree before editing:

```powershell
git status --short --branch
```

3. Look for stale implementation language:

```powershell
rg -n "future BFF|future \.NET BFF|first scaffold|placeholder|not yet deployed|was paused|still pending" README.md docs infra apps AGENTS.md .agents .github -g "*.md"
```

4. Patch in this order:

- root and docs indexes
- current architecture and operations docs
- subsystem runbooks
- package-level readmes
- skills and agent instructions

5. Format and verify:

```powershell
npx.cmd prettier --check .
git diff --check
```

Add lint, tests, builds, or Bicep builds when the doc pass follows code or IaC
changes in the same branch.

## Writing Rules

- Say what exists today before describing future phases.
- Label gaps as planned, source-supported, or live-environment gaps.
- Prefer short reader paths over duplicated long explanations.
- Keep demo inventories grouped by capability so they are easy to present.
- Keep stack claims aligned with `docs/reference/tech-stack.md` and actual
  package/IaC files.
- Do not document portal-only or one-off manual fixes as the source of truth.
- Keep Azure, Okta, GA/GTM, and GitHub workflows aligned with repo scripts and
  manifests.

## Good Output

A good doc pass leaves:

- an obvious place to start
- current architecture boundaries that match code
- runbooks that use real commands
- capability inventories that are grouped for demos
- stale "future" language removed where the capability now exists

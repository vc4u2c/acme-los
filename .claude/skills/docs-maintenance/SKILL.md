---
name: docs-maintenance
description: ACME LOS Markdown maintenance workflow for intuitive, accurate docs aligned with code, IaC, workflows, and deployed state.
---

# Docs Maintenance

This Claude-compatible skill mirrors `.agents/skills/docs-maintenance/SKILL.md`.

When this skill triggers:

1. Read `.agents/skills/docs-maintenance/SKILL.md`.
2. Follow that workflow as the source of truth.
3. Resolve any relative `scripts/`, `references/`, or `assets/` paths from `.agents/skills/docs-maintenance/`.
4. Adapt Codex-specific tool names to the equivalent Claude Code capabilities.

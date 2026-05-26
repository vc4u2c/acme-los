---
name: verification-loop
description: ACME LOS verification workflow before promotion, release, PR merge, auth changes, builds, tests, and E2E checks.
---

# Verification Loop

This Claude-compatible skill mirrors `.agents/skills/verification-loop/SKILL.md`.

When this skill triggers:

1. Read `.agents/skills/verification-loop/SKILL.md`.
2. Follow that workflow as the source of truth.
3. Resolve any relative `scripts/`, `references/`, or `assets/` paths from `.agents/skills/verification-loop/`.
4. Adapt Codex-specific tool names to the equivalent Claude Code capabilities.

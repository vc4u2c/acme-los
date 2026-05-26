---
name: documentation-lookup
description: Use current framework, library, SDK, API, CLI, and cloud documentation instead of stale model memory.
---

# Documentation Lookup

This Claude-compatible skill mirrors `.agents/skills/documentation-lookup/SKILL.md`.

When this skill triggers:

1. Read `.agents/skills/documentation-lookup/SKILL.md`.
2. Follow that workflow as the source of truth.
3. Resolve any relative `scripts/`, `references/`, or `assets/` paths from `.agents/skills/documentation-lookup/`.
4. Adapt Codex-specific tool names to the equivalent Claude Code capabilities.

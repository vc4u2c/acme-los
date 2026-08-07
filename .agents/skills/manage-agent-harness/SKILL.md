---
name: manage-agent-harness
description: Maintain the ACME LOS agent harness across Codex and Claude. Use when changing AGENTS.md, CLAUDE.md, repository skills, project-agent roles, provider adapters, context routing, owner-document mappings, validation scripts, or other context-engineering and adversarial-review controls.
---

# Manage Agent Harness

Keep one compact, provider-neutral source of truth and validate thin provider adapters around it.

## Workflow

1. Run `npm.cmd run harness:context` and `git status --short --branch`.
2. Read `AGENTS.md`, `docs/architecture/agent-harness.md`, `docs/architecture/change-safety-workflow.md`, and the harness files being changed. If review controls change, compare them with `origin/main`; a branch cannot weaken its own trusted review base.
3. Preserve the context layers:
   - root `AGENTS.md`: small routing and non-negotiable boundaries;
   - scoped `AGENTS.md`: framework instructions beside governed code;
   - owner documents: detailed architecture and operational truth;
   - `.agents/skills/<name>/SKILL.md`: canonical on-demand workflows;
   - `.agents/skills/<name>/agents/openai.yaml`: Codex discovery metadata only;
   - `.claude/skills/<name>/SKILL.md`: thin adapter to the canonical skill;
   - `.codex/agents/**` and `.claude/agents/**`: narrow specialist roles; and
   - `CLAUDE.md`: repository adapter that imports `AGENTS.md`.
4. Scaffold new skills with the standard skill creator. Keep bodies concise, imperative, and free of duplicated owner-document content. Put detailed optional policy in one-level `references/` files and repeated deterministic operations in scripts.
5. Update `tools/scripts/workspace/show-context.ps1` only when a path family has a clear owner document and verification command. The router reports context; it never edits, deploys, or transmits content.
6. Run the skill validator for each changed skill, `npm.cmd run agents:verify`, formatting, and `git diff --check`.

## Guardrails

- Treat `AGENTS.md`, `.agents/**`, `.claude/**`, `.codex/**`, harness scripts, and review policy as supply-chain sensitive.
- Keep skills independently useful and provider-neutral unless explicitly provider-specific.
- Do not create a skill for a rule that belongs in an existing owner document or `AGENTS.md`.
- Do not use chat transcripts as durable project context; promote confirmed decisions into their owner document.
- Do not claim automated review guarantees correctness, security, lending compliance, or production readiness.
- Do not let harness validation deploy, mutate cloud state, bypass Git hooks, or send repository content elsewhere.

# Agent Harness And Context Engineering

The ACME LOS harness keeps durable project knowledge discoverable without loading the entire monorepo into every agent turn.

## Context Layers

1. `AGENTS.md` is the compact always-on routing and safety contract.
2. `npm run harness:context` calculates the current branch and working-tree diff, then lists only relevant owner documents and checks.
3. Scoped `AGENTS.md` files provide framework guidance beside the code they govern.
4. Owner documents hold detailed architecture, security, visual, and operational decisions.
5. Repository skills under `.agents/skills` load specialized workflows only when relevant.
6. Project agents provide bounded exploration, documentation research, adversarial review, and frontend design critique.

Chat transcripts are not durable context. Promote confirmed decisions into the correct owner document and keep generated evidence out of source control.

## Cross-Provider Contract

- `.agents/skills/<name>/SKILL.md` is the canonical provider-neutral workflow.
- `.agents/skills/<name>/agents/openai.yaml` contains Codex discovery metadata, not workflow policy.
- `.claude/skills/<name>/SKILL.md` is a thin adapter pointing to the canonical skill.
- `.codex/config.toml` and `.codex/agents/**` define bounded Codex specialist roles.
- `.claude/agents/**` mirrors those logical roles; Claude's implementation worker maps to Codex's built-in worker.
- `CLAUDE.md` imports the root `AGENTS.md` contract.

Run `npm run agents:verify` after changing instructions, skills, adapters, project agents, or context routing. The validator rejects missing adapters or metadata, scaffold TODOs, oversized skills, broken references, thick Claude wrappers, role drift, and missing scoped routing.

## Context Router

Run:

```powershell
npm.cmd run harness:context
```

The router combines committed branch changes, staged and unstaged edits, and untracked files relative to the merge base. It only reports paths, owner documents, and suggested checks. It does not edit files, change Git state, start services, deploy infrastructure, call Okta, or transmit repository content.

## Adversarial Review

Invoke `$audit-acme-codebase` for a cold read-only review. The workflow reads the compact context, its LOS-specific review policy, and the routed owner documents before inspecting the changed code in risk order.

The audit is intentionally separate from remediation. Findings remain visible first; fixes happen in a later implementation pass with regression tests and the matching verification loop. Automated review is an additional control, not a correctness, security, lending-compliance, or production-readiness guarantee.

## Harness Ownership

Use `$manage-agent-harness` for context routing, canonical skills, adapters, project-agent roles, and validation. Treat these files as supply-chain-sensitive: a branch cannot weaken the trusted base policy for its own review.

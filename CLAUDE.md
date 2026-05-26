# ACME LOS Claude Guide

Read `AGENTS.md` first for the repository working rules.

Claude-compatible project skills live under `.claude/skills`. They intentionally
mirror the repo skills under `.agents/skills` so the `.agents` skill remains the
single source of truth.

When a `.claude/skills/<name>/SKILL.md` wrapper triggers, read the matching
`.agents/skills/<name>/SKILL.md`, resolve any relative bundled resources from
that `.agents/skills/<name>/` directory, and adapt Codex-specific tool names to
the available Claude Code tools.

## Skill Invocation Map

All current project skills are both automatically discoverable and available
for explicit developer invocation. They provide domain guidance or
verification rules; none represents an irreversible command by itself.

Reserve `disable-model-invocation: true` for future command-like skills where
the agent should not decide timing on its own, such as deploy, publish, merge,
or send-message workflows.

## Subagents

Project subagents live under `.claude/agents`. They implement the same logical
roles as `.codex/config.toml`, with one provider-specific adapter:
`implementation-worker` corresponds to Codex's built-in `worker` role.

Current project subagents:

- `explorer`
- `reviewer`
- `docs-researcher`
- `frontend-designer`
- `implementation-worker`

Use subagents only for bounded parallel work. Keep the main agent on the
critical path, assign disjoint write ownership, and avoid recursive delegation.

@AGENTS.md

# ACME LOS Claude Adapter

Canonical project skills live under `.agents/skills`; `.claude/skills` contains thin discovery adapters only. When a wrapper triggers, read its matching canonical `SKILL.md`, resolve relative resources from that canonical folder, and adapt tool names to Claude Code.

Project agents under `.claude/agents` mirror the logical roles in `.codex/config.toml`. `implementation-worker` maps to Codex's built-in worker role. Use bounded parallel work, keep the main agent on the critical path, assign disjoint write ownership, and avoid recursive delegation.

Run `npm.cmd run agents:verify` after changing instructions, skills, adapters, project agents, or harness routing.

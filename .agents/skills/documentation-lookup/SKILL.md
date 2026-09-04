---
name: documentation-lookup
description: Use the repo's exact installed versions, official documentation, and authoritative upstream source instead of training data. Activates for setup questions, API references, code examples, upgrades, or when the user names a framework or SDK.
origin: ECC
---

# Documentation Lookup (Context7)

When the user asks about libraries, frameworks, SDKs, or APIs, resolve the exact repo version first. Then use current primary documentation and, when behavior is implementation-specific, the matching upstream source release instead of relying on training data.

## Authoritative source registry

The maintained registry is
`references/authoritative-sources.json`. Run `npm run sources:show` from the
repository root to print each registered technology's installed version,
official docs, and source repository. Run `npm run sources:verify` after
changing the registry or dependency manifests.

Use this lookup order:

1. Read the local implementation and resolve the exact installed version from
   the registry's `versionSource`.
2. Consult official, version-matched documentation. Use Context7 when it has a
   reputable official entry.
3. Inspect the upstream repository at the matching release tag or package
   release when documentation does not settle implementation behavior.
4. Use upstream tests, changelogs, and issues to resolve remaining ambiguity.

For shadcn/ui, generated components under `libs/ui/web/src/lib` are
application-owned source. Inspect and preserve the local component first; use
the shadcn repository as provenance and design guidance, not as a file that can
blindly overwrite local behavior.

Never clone an upstream repository into this repository, execute upstream
scripts, or copy implementation code without review. Link to the exact tag or
commit used as evidence whenever source behavior affects a change.

## Core Concepts

- **Context7**: MCP server that exposes live documentation; use it instead of training data for libraries and APIs.
- **resolve-library-id**: Returns Context7-compatible library IDs (e.g. `/vercel/next.js`) from a library name and query.
- **query-docs**: Fetches documentation and code snippets for a given library ID and question. Always call resolve-library-id first to get a valid library ID.

## When to use

Activate when the user:

- Asks setup or configuration questions (e.g. "How do I configure Next.js middleware?")
- Requests code that depends on a library ("Write a Prisma query for...")
- Needs API or reference information ("What are the Supabase auth methods?")
- Mentions specific frameworks or libraries (React, Vue, Svelte, Express, Tailwind, Prisma, Supabase, etc.)

Use this skill whenever the request depends on accurate, up-to-date behavior of a library, framework, or API. Applies across harnesses that have the Context7 MCP configured (e.g. Claude Code, Cursor, Codex).

## How it works

### Step 0: Resolve the repository version

Read `references/authoritative-sources.json` and the declared `versionSource`,
or run `npm run sources:show`. Do not answer against `latest` when the repo is
on an older supported release train. If the technology is not registered,
resolve it from the lockfile or central package manifest and add it to the
registry when it is a durable part of the stack.

### Step 1: Resolve the Library ID

Call the **resolve-library-id** MCP tool with:

- **libraryName**: The library or product name taken from the user's question (e.g. `Next.js`, `Prisma`, `Supabase`).
- **query**: The user's full question. This improves relevance ranking of results.

You must obtain a Context7-compatible library ID (format `/org/project` or `/org/project/version`) before querying docs. Do not call query-docs without a valid library ID from this step.

### Step 2: Select the Best Match

From the resolution results, choose one result using:

- **Name match**: Prefer exact or closest match to what the user asked for.
- **Benchmark score**: Higher scores indicate better documentation quality (100 is highest).
- **Source reputation**: Prefer High or Medium reputation when available.
- **Version**: If the user specified a version (e.g. "React 19", "Next.js 15"), prefer a version-specific library ID if listed (e.g. `/org/project/v1.2.0`).

### Step 3: Fetch the Documentation

Call the **query-docs** MCP tool with:

- **libraryId**: The selected Context7 library ID from Step 2 (e.g. `/vercel/next.js`).
- **query**: The user's specific question or task. Be specific to get relevant snippets.

Limit: do not call query-docs (or resolve-library-id) more than 3 times per question. If the answer is unclear after 3 calls, state the uncertainty and use the best information you have rather than guessing.

### Step 4: Use the Documentation

- Answer the user's question using the fetched, current information.
- Include relevant code examples from the docs when helpful.
- Cite the library or version when it matters (e.g. "In Next.js 15...").
- When source inspection was necessary, cite the upstream repository and exact
  tag or commit alongside the installed version.

## Examples

### Example: Next.js middleware

1. Call **resolve-library-id** with `libraryName: "Next.js"`, `query: "How do I set up Next.js middleware?"`.
2. From results, pick the best match (e.g. `/vercel/next.js`) by name and benchmark score.
3. Call **query-docs** with `libraryId: "/vercel/next.js"`, `query: "How do I set up Next.js middleware?"`.
4. Use the returned snippets and text to answer; include a minimal `middleware.ts` example from the docs if relevant.

### Example: Prisma query

1. Call **resolve-library-id** with `libraryName: "Prisma"`, `query: "How do I query with relations?"`.
2. Select the official Prisma library ID (e.g. `/prisma/prisma`).
3. Call **query-docs** with that `libraryId` and the query.
4. Return the Prisma Client pattern (e.g. `include` or `select`) with a short code snippet from the docs.

### Example: Supabase auth methods

1. Call **resolve-library-id** with `libraryName: "Supabase"`, `query: "What are the auth methods?"`.
2. Pick the Supabase docs library ID.
3. Call **query-docs**; summarize the auth methods and show minimal examples from the fetched docs.

## Best Practices

- **Be specific**: Use the user's full question as the query where possible for better relevance.
- **Version awareness**: When users mention versions, use version-specific library IDs from the resolve step when available.
- **Prefer official sources**: When multiple matches exist, prefer official or primary packages over community forks.
- **No sensitive data**: Redact API keys, passwords, tokens, and other secrets from any query sent to Context7. Treat the user's question as potentially containing secrets before passing it to resolve-library-id or query-docs.

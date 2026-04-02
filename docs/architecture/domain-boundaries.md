# Domain Module Boundaries

This doc describes the dependency rules the repo enforces for `libs/*` and
`apps/*`.

These are not just ideals. They are backed by the Nx module-boundary rules in
[eslint.config.mjs](../../eslint.config.mjs).

## Enforced Scope Tags

The repo uses these main scope tags:

- `scope:core`
- `scope:domain`
- `scope:api`
- `scope:ui`
- `scope:auth`
- `type:app`
- `type:e2e`
- `platform:web`
- `platform:mobile`

## Scope Rules

### `scope:core`

Purpose:

- foundational types
- shared utilities
- runtime configuration
- logging and observability primitives

Can depend on:

- other `scope:core` libraries only

Examples:

- `@acme-los/core/types`
- `@acme-los/core/utils`
- `@acme-los/core/config`
- `@acme-los/core/logger`

### `scope:domain`

Purpose:

- business concepts and workflow rules for LOS
- borrower, loan, application, and underwriting models

Can depend on:

- `scope:core`
- `scope:domain`

Examples:

- `@acme-los/domain/loan`
- `@acme-los/domain/borrower`
- `@acme-los/domain/application`
- `@acme-los/domain/underwriting`

### `scope:api`

Purpose:

- transport contracts
- browser/server API clients
- server-side web facade helpers

Can depend on:

- `scope:core`
- `scope:domain`
- `scope:api`

Examples:

- `@acme-los/api/contracts`
- `@acme-los/api/web-client`
- `@acme-los/api/domain-client`
- `@acme-los/api/web-server`

### `scope:ui`

Purpose:

- reusable presentational components and view helpers

Can depend on:

- `scope:core`
- `scope:domain`
- `scope:ui`

Must not depend on:

- `scope:api`
- `type:app`

Examples:

- `@acme-los/ui-web`
- `@acme-los/ui-mobile`

### `scope:auth`

Purpose:

- auth contracts
- auth core helpers
- web auth integration helpers

Can depend on:

- `scope:core`
- `scope:auth`
- `scope:api`

Examples:

- `@acme-los/auth/contracts`
- `@acme-los/auth/core`
- `@acme-los/auth/web`

## App And E2E Rules

### `type:app`

Apps can depend on:

- `scope:core`
- `scope:domain`
- `scope:api`
- `scope:ui`
- `scope:auth`

### `type:e2e`

E2E projects can depend on:

- `scope:core`
- `scope:domain`
- `scope:api`
- `scope:ui`
- `scope:auth`

## Platform Rules

### `platform:web`

Web projects must not depend on:

- `platform:mobile`

### `platform:mobile`

Mobile projects must not depend on:

- `platform:web`

That means:

- `apps/web-app` and web-only libs should not pull in mobile UI
- `apps/mobile-app` and mobile-only libs should not pull in web UI

## LOS Workflow Ownership

### `domain/borrower`

Owns:

- borrower identity model
- contact information
- consent state
- borrower profile status

### `domain/loan`

Owns:

- loan product selection
- loan terms
- pricing inputs
- amortization-related value objects

### `domain/application`

Owns:

- application lifecycle state
- application submission payload
- milestones and status transitions
- relationship between borrower and selected loan

### `domain/underwriting`

Owns:

- underwriting decision state
- conditions
- findings
- approval / decline / suspend outcomes

## Practical Rules

- Put transport DTOs in `api/contracts`, not in `domain/*`
- Keep validation close to boundaries:
  - input contract validation in `api/*`
  - business invariants in `domain/*`
- Keep app-specific route composition in apps, not shared libs
- Avoid deep relative imports across projects; use the configured
  `@acme-los/*` paths

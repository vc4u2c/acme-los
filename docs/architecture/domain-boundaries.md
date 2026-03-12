# Domain Module Boundaries

This document defines the intended dependency direction for the Loan Origination System modules in `libs/`.

## Layers

### `libs/core/*`

Purpose:

- foundational types
- shared utilities
- runtime configuration
- logging and observability primitives

Allowed dependencies:

- other `libs/core/*` libraries only

Must not depend on:

- `domain`
- `api`
- `ui`
- apps

Libraries:

- `@acme-los/core/types`
- `@acme-los/core/utils`
- `@acme-los/core/config`
- `@acme-los/core/logger`

### `libs/domain/*`

Purpose:

- business concepts and workflow rules for LOS
- borrower, loan, application, and underwriting models

Allowed dependencies:

- `libs/core/*`
- other `libs/domain/*` libraries when the dependency is business-valid

Must not depend on:

- `api`
- `ui`
- apps

Libraries:

- `@acme-los/domain/loan`
- `@acme-los/domain/borrower`
- `@acme-los/domain/application`
- `@acme-los/domain/underwriting`

### `libs/api/*`

Purpose:

- external and internal API contracts
- transport DTOs
- HTTP client adapters

Allowed dependencies:

- `libs/core/*`
- `libs/domain/*`
- other `libs/api/*`

Must not depend on:

- `ui`
- apps

Libraries:

- `@acme-los/api/client`
- `@acme-los/api/contracts`

### `libs/ui/*`

Purpose:

- reusable presentational components and view helpers

Allowed dependencies:

- `libs/core/*`
- `libs/domain/*`
- same-platform `libs/ui/*`

Must not depend on:

- `api`
- apps
- opposite-platform UI libraries

Libraries:

- `@acme-los/ui-web`
- `@acme-los/ui-mobile`

## App Boundaries

### `apps/web-app`

Can depend on:

- `core`
- `domain`
- `api`
- `ui-web`

Must not depend on:

- `ui-mobile`

### `apps/mobile-app`

Can depend on:

- `core`
- `domain`
- `api`
- `ui-mobile`

Must not depend on:

- `ui-web`

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

## Recommended Rules

- Put transport DTOs in `api/contracts`, not in `domain/*`
- Keep validation close to boundaries:
  - input contract validation in `api/*`
  - business invariants in `domain/*`
- Keep app-specific route state in apps, not shared libs
- Avoid deep relative imports across projects; use the configured `@acme-los/*` paths

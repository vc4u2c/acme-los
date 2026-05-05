# ADR-001: Keep The Current Layout First

- Status: Proposed
- Date: April 23, 2026

## Context

The repo already contains:

- web
- mobile
- shared libraries
- auth
- Azure and Okta infrastructure
- CI/CD
- release automation
- docs
- tests
- repo tooling

The team is considering:

1. relayouting the repo into a product-scoped shape such as
   `apps/acme-los/*` and `libs/acme-los/*`
2. adding a new .NET BFF

The key question is which should happen first.

## Options Considered

### Option A: Keep The Current Layout For Now

Characteristics:

- no repo-wide move yet
- add the BFF inside the current `apps/*` shape
- revisit relayout later only if the repo growth justifies it

### Option B: Prefix Every App And Library

Examples:

- `acme-los-web`
- `acme-los-mobile`
- `acme-los-bff`

Characteristics:

- keeps a flat folder shape
- makes naming longer and noisier
- does not create a meaningful product or platform boundary

### Option C: Product-Scoped Relayout First

Examples:

- `apps/acme-los/web`
- `apps/acme-los/mobile`
- `apps/acme-los/bff`

Characteristics:

- cleaner long-term shape if the repo becomes truly multi-product
- large immediate blast radius
- touches code, tooling, docs, CI/CD, infra references, and release config

## Decision

Choose Option A now.

That means:

- keep the repo name as `acme-los`
- keep the current top-level layout for now
- do not adopt prefix-everything naming
- add the BFF first
- revisit Option C only when the repo has a real second product or enough
  product-specific surface area to justify the move

## Why

The BFF creates more architectural value than a relayout.

It directly improves:

- backend boundaries
- persistence direction
- long-term ownership of business logic
- the ability to keep the Next facade thin

The relayout is mostly structural hygiene unless the repo has grown enough to
need a stronger product boundary.

## Consequences

### Positive

- lower immediate risk
- smaller blast radius
- faster path to a useful BFF
- stable paths for Azure, Okta, CI/CD, and docs in the near term

### Negative

- the repo stays less future-looking for a while
- product grouping remains implicit rather than explicit
- a later relayout still has to be planned carefully

## Revisit Conditions

Revisit this ADR when one or more of these are true:

- the BFF is real and stable
- the repo contains a second product family
- product-specific libraries are causing naming confusion
- flat `apps/*` and `libs/*` organization is slowing onboarding or maintenance

## Rejected Option

The prefix-everything approach was rejected because it creates noise without
creating a meaningful architectural boundary.

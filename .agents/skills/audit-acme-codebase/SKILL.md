---
name: audit-acme-codebase
description: Perform a cold, read-only, evidence-first security, correctness, architecture, UX, and operability review of ACME LOS. Use for pre-PR adversarial review, authentication or BFF boundary review, regression-risk assessment, infrastructure review, UI quality review, or a whole-codebase audit before fixing accepted findings.
---

# Audit ACME LOS Codebase

## Review Workflow

1. Run `npm.cmd run harness:context` and `git status --short --branch`.
2. Read root `AGENTS.md`, [the LOS review policy](references/review-policy.md), and only the owner documents selected by the context router. For a whole-codebase audit, also read `README.md`, `docs/architecture/current-platform.md`, and `docs/architecture/enterprise-readiness.md`.
3. Establish the base with `git merge-base origin/main HEAD`. Review committed, staged, unstaged, and untracked changes. Use `git ls-files` for a full audit and exclude generated or ignored directories.
4. If the branch changes `AGENTS.md`, `.agents/**`, `.claude/**`, `.codex/**`, harness scripts, or review policy, compare those controls with `origin/main`. A branch cannot weaken the trusted base for its own review.
5. Inspect in risk order:
   - Okta IDX, sessions, assurance, recovery, account mutation, and subject continuity;
   - Next-to-BFF trust, CSRF, authorization, DTO minimization, and customer isolation;
   - secrets, Key Vault, managed identity, private networking, and deployment permissions;
   - application state, retries, error handling, data integrity, and observability privacy;
   - responsive UI, accessibility, interaction states, and visual regressions;
   - tests, documentation truth, dependency integrity, and maintainability.
6. Run only deterministic checks that can confirm or reject a suspected finding. Inspect any repository command changed by the branch before trusting it.
7. Report findings first, ordered by severity. If no material finding remains, say so and list residual risks or untested boundaries.

## Read-Only Boundary

Do not edit files, mutate Git state, create cloud resources, deploy, or transmit repository content during the audit. After findings are visible, perform fixes as a separate implementation pass with regression tests and risk-matched verification.

## Finding Contract

Use one item per independently actionable defect:

- `[S0-S3] Concise title`
- Evidence: clickable file and line.
- Failure path: concrete actor, input, or runtime sequence.
- Impact: confidentiality, integrity, availability, correctness, accessibility, compliance, or operability.
- Recommendation: smallest safe remediation and the regression test that proves it.
- Confidence: high, medium, or low; state missing evidence below high.

Severity meanings:

- S0: active compromise, irreversible loss, or broad customer breach.
- S1: credible security-boundary bypass, material corruption, or release blocker.
- S2: bounded correctness, resilience, accessibility, or maintainability defect with a concrete failure path.
- S3: low-impact hardening or clarity issue worth scheduling.

Do not report style preferences, vague future risks, or work already documented as deferred. Never reveal credentials, tokens, customer data, personal data, or chain-of-thought.

# Docs Index

This repo keeps the root [README.md](../README.md) short and uses smaller docs for deeper topics.

## How To Use These Docs

The docs are organized around reader intent:

- start with `getting-started` when you need to run or verify the repo
- use `architecture` for current implementation boundaries
- use `operations` for Azure, release, promotion, and environment lifecycle
- use `reference` for stable standards and toolchain details

The architecture pages describe what exists today. The Azure platform plan is
part current-state snapshot and part target-state strategy; it calls that out
explicitly so readers do not mistake future phases for deployed behavior.

## Fast Demo Inventory

For a grouped feature/design inventory, start with:

- [Reference architecture demo report](./architecture/reference-architecture-demo-report.md) - 30-item reference architecture demo showcase across engineering, product UI, identity, BFF security, Azure, observability, analytics, and tooling.
- [Root README demo feature inventory](../README.md#demo-feature-inventory)
- [Azure and website demo runbook](./operations/azure-and-website-demo-runbook.md)
- [Tech stack and tooling](./reference/tech-stack.md)
- [Enterprise readiness](./architecture/enterprise-readiness.md)

The short version: ACME LOS demonstrates an Nx monorepo, Next.js web app, Expo
mobile app, `.NET` BFF, Okta auth, server-side sessions, CSRF, Redis-backed
state, Azure Container Apps, Key Vault/private endpoints, Application
Insights/Log Analytics, GitHub Actions CI/CD, Nx Release versioning, Husky
commit guardrails, shadcn/Radix/Tailwind UI primitives, and TanStack Query,
Form, and Table workflows, including the UI layout grid and data grid system.
It now also has a repo-owned GA4/GTM analytics admin plane, web runtime
analytics wiring, optional managed-identity service auth between Next and the
BFF, Okta account-security/profile-sync runbooks, a staged ACS-backed SMS MFA
path, and a documented HTTP API testing path.

## Suggested Read Order

If you are onboarding or coming back after a break, this is the shortest good
path:

1. [Local development](./getting-started/local-development.md)
2. [Workspace commands](./getting-started/workspace-commands.md)
3. [Tech stack and tooling](./reference/tech-stack.md)
4. [Current platform architecture](./architecture/current-platform.md)
5. [Server-side auth flows](./architecture/auth-server-flows.md)
6. [Next web server/client boundaries](./architecture/web-server-client-boundaries.md)

## Getting Started

- [Local development](./getting-started/local-development.md)
- [Workspace commands](./getting-started/workspace-commands.md)

## Architecture

- [Agent harness and context engineering](./architecture/agent-harness.md)
- [Change safety workflow](./architecture/change-safety-workflow.md)
- [Web visual design system](./architecture/visual-design-system.md)
- [Reference architecture demo report](./architecture/reference-architecture-demo-report.md)
- [Current platform architecture](./architecture/current-platform.md)
- [BFF rollout plan](./architecture/bff-rollout-plan.md)
- [BFF implementation checklist](./architecture/bff-implementation-checklist.md)
- [Future repo relayout plan](./architecture/future-repo-relayout-plan.md)
- [ADR-001: keep the current layout first](./architecture/adr-001-current-layout-first.md)
- [Server-side auth flows](./architecture/auth-server-flows.md)
- [Next web server/client boundaries](./architecture/web-server-client-boundaries.md)
- [Auth and API contracts](./architecture/auth-and-api-contracts.md)
- [Domain boundaries](./architecture/domain-boundaries.md)
- [Enterprise readiness](./architecture/enterprise-readiness.md)

## Operations

- [Release and delivery](./operations/release-and-delivery.md)
- [Azure and website demo runbook](./operations/azure-and-website-demo-runbook.md)
- [Azure platform plan](./operations/azure-platform-plan.md)
- [Azure governance and lifecycle](./operations/azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./operations/azure-bootstrap-and-teardown.md)
- [Azure monitoring and workbooks](./operations/azure-monitoring-and-workbooks.md)
- [Okta SMS MFA with Azure Communication Services](./operations/okta-sms-mfa-with-acs.md)
- [Okta account security and profile sync](./operations/okta-account-security-and-profile-sync.md)
- [Repeated workflows and skill map](./operations/repeated-workflows-and-skill-map.md)
- [GitHub and Azure environments](./operations/github-azure-environments.md)
- [Pipeline portability](./operations/pipeline-portability.md)
- [Azure infrastructure scaffold](../infra/azure/README.md)

Current Azure cost-control flow for non-production workloads:

- `npm run azure:show-state -- -EnvironmentName dev`
- `npm run azure:pause:web -- -EnvironmentName dev`
- `npm run azure:resume:web -- -EnvironmentName dev`

Use [Azure bootstrap and teardown](./operations/azure-bootstrap-and-teardown.md)
for the full deploy, smoke-check, pause, resume, and teardown command path.

## Reference

- [Tech stack and tooling](./reference/tech-stack.md)
- [VS Code setup](./reference/vscode-setup.md)
- [HTTP API testing](./reference/http-api-testing.md)
- [Azure naming standard](./reference/azure-resource-naming-standard.md)

## Infra And Admin Plane

- [Okta admin plane](../infra/okta/README.md)
- [Analytics admin plane](../infra/analytics/README.md)

## Package-Level Readmes

- [Web UI library](../libs/ui/web/README.md)
- [Mobile UI library](../libs/ui/mobile/README.md)

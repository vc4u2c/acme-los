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

- [Current platform architecture](./architecture/current-platform.md)
- [BFF rollout plan](./architecture/bff-rollout-plan.md)
- [Future repo relayout plan](./architecture/future-repo-relayout-plan.md)
- [ADR-001: keep the current layout first](./architecture/adr-001-current-layout-first.md)
- [Server-side auth flows](./architecture/auth-server-flows.md)
- [Next web server/client boundaries](./architecture/web-server-client-boundaries.md)
- [Auth and API contracts](./architecture/auth-and-api-contracts.md)
- [Domain boundaries](./architecture/domain-boundaries.md)

## Operations

- [Release and delivery](./operations/release-and-delivery.md)
- [Azure and website demo runbook](./operations/azure-and-website-demo-runbook.md)
- [Azure platform plan](./operations/azure-platform-plan.md)
- [Azure governance and lifecycle](./operations/azure-governance-and-lifecycle.md)
- [Azure bootstrap and teardown](./operations/azure-bootstrap-and-teardown.md)
- [Azure monitoring and workbooks](./operations/azure-monitoring-and-workbooks.md)
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
- [Azure naming standard](./reference/azure-resource-naming-standard.md)

## Infra And Admin Plane

- [Okta admin plane](../infra/okta/README.md)

## Package-Level Readmes

- [Web UI library](../libs/ui/web/README.md)
- [Mobile UI library](../libs/ui/mobile/README.md)

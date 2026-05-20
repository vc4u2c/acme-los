# Future Repo Relayout Plan

This doc describes how to approach a future repo relayout if the workspace
grows beyond the current single-product shape.

Related docs:

- [bff-rollout-plan.md](./bff-rollout-plan.md)
- [adr-001-current-layout-first.md](./adr-001-current-layout-first.md)
- [current-platform.md](./current-platform.md)

## Current Recommendation

Do not relayout first.

The recommended order is:

1. add the BFF in the current layout
2. prove the BFF architecture and deployment path
3. relayout only if the repo growth actually justifies it

## Triggers That Would Justify A Relayout

A relayout becomes reasonable when one or more of these are true:

- the repo contains more than one product family
- the repo contains multiple major backend apps, not just the current BFF
- product-specific libraries are multiplying and the flat `libs/*` shape is
  causing real confusion
- docs, scripts, CI, and naming standards have to repeatedly explain which
  projects belong to ACME LOS versus future sibling products
- platform and shared libraries need a cleaner line from product libraries

## Target Shape If The Relayout Happens

Prefer product folders over prefixing every project name.

Good future target:

```text
apps/
  acme-los/
    web/
    mobile/
    bff/
libs/
  acme-los/
    api/
    auth/
    domain/
    ui/
  platform/
    observability/
    config/
    tooling/
  shared/
    types/
    utilities/
docs/
  architecture/
  operations/
  reference/
```

Avoid this style:

```text
apps/
  acme-los-web
  acme-los-mobile
  acme-los-bff
libs/
  acme-los-api-contracts
  acme-los-auth-core
  acme-los-domain-application
```

The product-folder shape scales better than prefix soup.

## Repo Name Guidance

A relayout does not automatically require a repo rename.

Current guidance:

- keep the repo name as `acme-los` while the workspace is still centered on one
  product family
- do not rename the repo to `acme-ui` because the workspace already owns far
  more than UI
- revisit the repo name only if the workspace truly becomes a broader
  multi-product platform repo

## Blast Radius Checklist

A relayout affects the whole repo, not just the app folders.

### Nx And Project Configuration

- `nx.json`
- project roots
- project names
- implicit dependencies
- tags and boundary rules
- cached outputs
- affected graph behavior
- Nx Release group definitions

### Language And Build Tooling

- `tsconfig.base.json` path aliases
- Jest and Playwright config
- ESLint and module-boundary rules
- `.NET` solution and project references if the BFF exists by then

### Application Build And Packaging

- Dockerfiles
- image build contexts
- output paths
- static asset copy paths
- local run scripts

### CI/CD And Release

- GitHub Actions working directories
- build and deploy scripts
- Nx task invocations
- artifact paths
- release tags and changelog expectations

### Infrastructure And Admin Plane References

- Azure deployment scripts and config paths
- Bicep parameter file references
- Okta docs and environment render tooling
- health URL docs and runbooks

### Tests

- e2e path assumptions
- snapshots
- fixture paths
- route smoke tests

### Documentation

- README links
- docs index links
- architecture references
- operations runbooks
- reference docs

### Repo Tooling

- Husky hooks
- lint-staged file patterns
- custom scripts under `tools/*`
- agent, skill, and repo-local AI config that references specific paths

## Proposed Execution Sequence

If the relayout becomes worth doing, use this order:

### Phase 0: Freeze Scope

- do not combine the relayout with a major product feature
- do not combine it with the first BFF rollout
- avoid mixing dependency upgrades into the same branch

### Phase 1: Inventory Path Assumptions

- search the repo for hard-coded paths
- build the path-assumption checklist before moving files
- mark which assumptions are code, docs, CI, infra, or tooling

### Phase 2: Define The Target Naming Map

- define old path to new path mappings
- define project-name mappings
- define alias mappings
- decide which libraries are `acme-los`, `platform`, or `shared`

### Phase 3: Move Applications

- move apps into the product folder first
- update build, test, Docker, and workflow references
- keep the app names stable if possible while roots move underneath them

### Phase 4: Move Libraries

- move libraries by domain group, not one random folder at a time
- update path aliases and module boundaries as each group moves
- keep the contract, auth, domain, and UI groups coherent during the move

### Phase 5: Update Docs, Infra, And Tooling

- update README and docs index
- update Azure and Okta path references
- update repo tooling and local AI config

### Phase 6: Full Verification

Run the full repo sweep after the relayout:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue
Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue
npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

Add the BFF build and test verification too if it exists by then.

## Non-Goals

- changing product behavior
- redesigning auth flows
- changing Azure topology
- rebranding the repo to a narrower name

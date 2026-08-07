# Change Safety Workflow

ACME LOS uses independent local, adversarial, remote, and human review boundaries:

```text
focused branch and explicit intent
  -> repository-owned read-only adversarial review
  -> accepted fixes plus risk-matched local verification
  -> pull request and independent GitHub checks
  -> human merge decision
  -> source-controlled Okta or Azure promotion
  -> live health and journey verification
```

No boundary guarantees correctness. Auth, account recovery, funding step-up, secret handling, lending decisions, and production promotion still require explicit human judgment.

## Local Controls

- Run `npm run harness:context` before broad discovery.
- Use `$audit-acme-codebase` before promoting security-sensitive or cross-boundary changes.
- Run the applicable `verification-loop` gate before push.
- Run `npm run agents:verify` whenever harness controls change.
- Do not bypass Husky, Commitlint, dependency audits, or failing tests to make a branch pass.

Review-control changes are supply-chain-sensitive. Compare changes to `AGENTS.md`, `.agents/**`, `.claude/**`, `.codex/**`, and harness scripts with `origin/main`; the proposed policy is itself a review target.

## GitHub Controls

The `CI` workflow runs with read-only repository contents, installs the lockfile with `npm ci`, validates the agent harness, audits Node and NuGet dependencies, validates Nx tags, and runs affected lint and tests. `Commitlint` independently validates pull-request commits.

Main-only release and deployment workflows are separate from pull-request verification. Keep deployment credentials out of pull-request jobs and preserve environment approvals, concurrency, artifact provenance, health checks, and source-owned infrastructure definitions.

## Promotion Controls

Apply Okta bootstrap and Azure deployment only from reviewed source. After deployment, verify the public health endpoint, release/build identity, ACA revision, and the live journeys affected by the change. A successful source build does not prove tenant configuration or OTP delivery.

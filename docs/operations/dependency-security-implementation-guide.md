# Dependency Security Implementation Guide

Use this guide for dependency remediation, compatibility evidence, outstanding
work, and the dated implementation record. The supported versions and enduring
upgrade policy stay in the
[technology lifecycle baseline](../architecture/technology-lifecycle.md).

## What Needs Fixing

The November 4 [PR #138 CI run](https://github.com/vc4u2c/acme-los/actions/runs/41962473235)
checks commit `74c58f0`: lint/tests and commit validation passed; Node Dependency
Audit failed. Its November 4, 2026 result is 57 affected packages across four
root advisories, not 57 independent defects. Release and artifact jobs were
skipped because this was a pull-request run, not a deployment.

A read-only `npm audit --json` refresh on November 10 against the same lockfile
reports 56 affected packages: 0 critical, 3 high, 46 moderate, and 7 low. The
same four root advisories remain. No dependency was changed by this refresh;
the changed aggregate is scanner output, not a newly implemented fix. This is
local audit evidence, not a new GitHub CI run.

The November 12 fixes below remove the Glob advisory and patch Istanbul's
separate minimatch path. The local audit now reports 50 affected packages:
0 critical, 3 high, 30 moderate, and 17 low, across three root advisories.
The higher low-severity count reflects dependency changes and affected
dependents, not new root advisories. The moderate-or-higher audit still fails;
this is progress, not a green CI claim.

| Work item                                  | Required next action                                                                                                                               | Acceptance evidence                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `minimatch` through Nx and related tooling | Find an owner-supported patched release or review a coordinated migration that preserves Nx's use of `makeRe`. Do not globally force minimatch 11. | Audit path removed; project selection, generators, release-tag matching, lint, tests, and builds pass.              |
| Expo CLI's separate Zod 3 copy             | Upgrade the supported Nx/Expo toolchain together or verify a scoped Zod migration. Updating the application's Zod alone does not fix this path.    | CLI startup, configuration validation, exports, and tests pass; the vulnerable CLI copy is gone.                    |
| `deepmerge`                                | Recheck upstream for a patched release; no patch was published at the November 4 checkpoint.                                                       | Vulnerable path removed without breaking its owners. Low severity does not currently block CI, but remains tracked. |

See [November 4 security servicing](#november-4-security-servicing) for the exact
advisories, resolved versions, and compatibility constraints. Recheck registry
and advisory data before implementing: a dated result is not a live scan.
The PR is not merge-ready while its required audit fails.

## Implementation Workflow

1. Use the Node version in `.nvmrc` and npm version in `package.json`. Start in
   the intended branch/worktree and preserve unrelated changes.
2. Run `npm.cmd run audit:node`, `npm.cmd audit --json`, and
   `npm.cmd run dotnet:audit:ci`. Trace each affected package to its owner with
   `npm.cmd ls <package>` and check version-matched upstream release notes.
3. Prefer an allowed lockfile update, then an owner update. Any override outside
   an owner's declared range needs focused compatibility tests and explicit
   rationale. Do not force a major upgrade or suppress an advisory to pass CI.
4. Validate a clean `npm.cmd ci` with the existing strict lifecycle-script
   approvals. Run `node --test tools/scripts/dependencies/tests/*.test.mjs` and
   the applicable lint, unit, build, and browser checks from
   [release and delivery](./release-and-delivery.md).
5. Publish the exact audit results, commit, and verification evidence. Require
   passing independent GitHub checks before merge. Deployment and Azure rebuild
   remain separate explicit operations, not part of dependency remediation.

## Reading The PR Comments

As inspected on November 10, 2026, PR #138 has four top-level verification
comments, no submitted reviews, and no inline review threads. These are
implementation/status reports, not reviewer requests to change code.

| Comment checkpoint (America/Chicago)                                                         | Meaning                                                                                                   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| October 15, `5aac3cb`                                                                        | Early test results and the then-running Azure environment; historical, not current infrastructure status. |
| October 15, `ad9ca1c`                                                                        | A later dependency pass with three root advisories remaining at that time.                                |
| October 16, `d94d864`                                                                        | CSS parser compatibility verified; two root advisories remained at that checkpoint.                       |
| [November 4, `74c58f0`](https://github.com/vc4u2c/acme-los/pull/138#issuecomment-6649034833) | Latest completed CI evidence for this commit; supersedes older audit counts and readiness claims.         |

The November 4 comment is timestamped November 5 in UTC. Keep historical
comments as evidence; do not interpret old counts or statements about running
Azure resources as current. For infrastructure lifecycle state, use the
[Azure bootstrap and teardown runbook](./azure-bootstrap-and-teardown.md).

## Dated Implementation Record

The following sections preserve the rationale and results from each change.
They describe their stated checkpoint, not current package availability or
permission to deploy.

### September 11 security servicing

The September patch set updated Next.js and its ESLint packages to `16.3.4`,
sharp to `0.35.4`, Hono to `4.13.7`, and both SVGO release lines to `3.3.5` and
`4.1.0`. These cover the same package updates proposed in Dependabot PRs
#126, #127, #129, and #130 without changing the Nx/Expo framework train.
The existing `js-yaml` override advances to `4.3.2`.

That patch set introduced two temporary overrides for their exact owners:

- `nx@22.7.8` pins `smol-toml@1.6.1`; use `1.8.0` for
  [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2).
- `@module-federation/dts-plugin@2.8.2` pins `adm-zip@0.6.0`; use `0.6.1`
  for [GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9).

Both paths are development/build tooling. The October servicing below
supersedes these pins. Do not downgrade Nx or disable the audit to resolve its
pinned packages.

References: [Next.js 16.3.4](https://github.com/vercel/next.js/releases/tag/v16.3.4),
[sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
[js-yaml 4.3.2](https://github.com/nodeca/js-yaml/releases/tag/4.3.2),
[smol-toml 1.8.0](https://github.com/squirrelchat/smol-toml/releases/tag/v1.8.0),
and [adm-zip 0.6.1](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1).

### October 15 security servicing

The PR lockfile advances Next.js and its ESLint packages to `16.3.8` and all
Nx packages to `22.7.10`, without changing the Expo/NativeWind framework train.
Nx `22.7.10` is the minimum 22.7 patch covering both
[migration path validation](https://github.com/nrwl/nx/security/advisories/GHSA-hrvq-x7jp-36xv)
and [the preceding advisory](https://github.com/nrwl/nx/security/advisories/GHSA-w3vv-58gj-gw77).
The migration manifests and published Nx postinstall entrypoint are unchanged
from `22.7.8`; only the exact `nx@22.7.10` install-script approval replaces the
previous approval. Strict install-script enforcement remains enabled.

Azure Monitor advances to `1.20.1` with its supported OpenTelemetry `0.221`
dependency set, including patched MySQL/PostgreSQL instrumentation. Obsolete
OpenTelemetry version overrides are removed; the direct logging API follows
the vendor's version. See the
[Azure Monitor changelog](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/monitor/monitor-opentelemetry/CHANGELOG.md).
Other compatible lockfile updates cover gRPC, MCP SDK, Axios, compression,
fast-uri, Handlebars, ip-address, proxy-addr, sharp, shell-quote, and source-map-js.

The remaining owner-scoped security pins are `brace-expansion@5.0.12` for
`nx@22.7.10` and `minimatch@10`, and `smol-toml@1.9.1` for `nx@22.7.10`.
The direct brace-expansion pin is also updated. Module Federation's `2.9.2`
DTS plugin now requests patched adm-zip, ws, and undici itself, so its obsolete
overrides are removed. Remove each remaining override when its owner adopts
the patched dependency.

The October 15 scan falls from 98 affected packages (4 critical, 80 high,
14 moderate) to 52 (0 critical, 50 high, 2 moderate). These are package counts,
including vulnerable dependents, not 52 distinct root advisories. At that point,
three root advisories blocked `npm run audit:node` and promotion:

| Package                         | Dependency path                                          | Remaining blocker                                                                                                                            |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `braces@3.0.3`                  | micromatch/chokidar through build, test, and CSS tooling | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high; no patched npm release published at verification time        |
| `node-forge@1.4.0`              | Expo CLI and `@expo/code-signing-certificates`           | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), high; no patched npm release published at verification time        |
| `postcss-selector-parser@6.1.4` | Tailwind `3.4.19` and postcss-nested `6.2.0`             | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate; patched `7.1.6` is outside both owners' supported ranges |

Parser 7 changes iteration semantics and is not treated as an unverified
patch-level fix. The focused compatibility work below addresses this path.

### October 16 CSS parser compatibility

Two exact-owner overrides select the published `postcss-selector-parser@7.1.6`
release under `tailwindcss@3.4.19` and `postcss-nested@6.2.0`. This is an
application-verified compatibility override outside the vendors' declared
parser ranges, not a vendor endorsement or a Tailwind/NativeWind framework
upgrade. The prior installed copies were `6.1.4`; the earlier note identifying
them as `6.1.2` confused the dependency range minimum with the resolved version.

[Parser 7's iteration change](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0)
affects insertion during walks, used by
[Tailwind variant finalization](https://github.com/tailwindlabs/tailwindcss/blob/v3.4.19/src/util/formatVariantSelector.js).
The CI `Test dependency compatibility` step (originally the CSS toolchain step)
exercises actual installed
packages for variant merging, escaped selectors, pseudo-element ordering,
`@apply`, nested selector lists and parent cloning, media bubbling, and
NativeWind's CSS-to-native conversion. It verifies each owner's resolved parser
version and bounds large/malformed selector probes in a child process.

A clean `npm ci` resolves both owners to `7.1.6`. Full application stylesheet
comparisons before/after the change are byte-identical for web, mobile web,
Android, and iOS; this checks output and rule ordering beyond isolated samples.

When upgrading either owner or changing the pin, rerun these contracts plus
web/mobile builds and browser tests. Remove the corresponding override when
the owner adopts a patched parser itself. No package source is patched or
forked, and no new dependency lifecycle script is approved.

The refreshed scan reports 50 affected packages, all high severity, from only
the two root advisories in `braces` and `node-forge`. Both registries and
advisories still report no published patched release as of October 16. The
audit allowlist stays empty; the moderate-or-higher gate still blocks promotion.
Do not replace the remaining packages with incompatible APIs or suppress the
findings just to turn CI green. Promotion remained blocked at that checkpoint;
the later cost-saving retirement is recorded in the Azure lifecycle runbook.

### November 4 security servicing

This increment is CI-only. It does not merge or deploy the branch, rebuild Azure,
or change the moderate-or-higher audit gate. The audit allowlist remains empty.

Compatible updates include Next.js and its ESLint packages `16.4.5`, Azure
Identity `4.14.1` with its supported MSAL Node `7.1.2`, Forge `1.4.3`, Zod
`4.6.7` for the app, and shadcn `4.23.0`. Module Federation updates through its
declared owner ranges to `2.9.3`, which requests patched Undici `7.30.1`.
The existing decode-uri-component, launch-editor, and qs pins advance to
`0.5.1`, `2.14.2`, and `6.16.2`; compatible lockfile updates also cover
body-parser, fast-uri, serialize-javascript, and systeminformation.

Nx `22.7.10` still pins vulnerable `follow-redirects@1.16.0`, so an exact-owner
override selects the published `1.16.2` patch. No framework migration, package
source patch, lifecycle-script approval, or security exception is introduced.
The Forge compatibility tests exercise Expo's actual certificate-signing owner,
valid and modified payloads, and rejection of extra nested DigestAlgorithm
elements. CI runs these alongside the existing CSS toolchain contracts.

The earlier braces advisory was
[withdrawn upstream on October 23](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Forge's [upstream changelog](https://github.com/digitalbazaar/forge/blob/v1.4.3/CHANGELOG.md)
documents the RSA fix in `1.4.1` and subsequent security fixes in `1.4.3`.
These changes do not justify suppressing other findings.

Remaining dependency constraints require separate compatibility work or upstream
releases before the audit can pass:

| Dependency               | Constraint                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimatch@9/10`         | [Patched 11.0.1+](https://github.com/advisories/GHSA-g3hv-75wg-m249) removes `makeRe`, which Nx calls for project selection, generators, and release tag matching. A global major override would break real tooling paths. |
| `glob@10/13`             | [Patched 14.0.2+](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) is outside Jest and Expo's declared ranges and changes matching, ignore, and internal walker behavior.                                                |
| Expo CLI's `zod@3.25.76` | [Patched 4.6.6+](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) is a major API migration outside Expo 55's declared range. Updating the app's Zod does not remove this separate copy.                                  |
| `deepmerge@4.3.1`        | [Low-severity prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no published patched version. The existing CI threshold does not block low findings, but this remains unresolved.                |

These packages are not automatically considered dev-only: the web Docker runner
installs root production dependencies in addition to the standalone output, and
Expo/NativeWind dependencies can therefore be installed in that image. Runtime
package isolation is a separate change, not a reason to omit dependencies from
the CI audit. Azure remains retired with automatic CD disabled.

The November 4 audit dropped from 83 affected packages (1 critical, 16 high,
59 moderate, 7 low) to 57 (0 critical, 3 high, 47 moderate, 7 low). These are
affected dependency counts, not distinct advisories: the four advisories above
account for the remaining transitive findings. `npm run audit:node` still fails
as intended; this branch is not ready to merge under the existing security gate.

Local verification with Node `24.19.0` and npm `11.17.0` passed:

- Clean `npm ci --no-audit` with the existing strict lifecycle-script allowlist.
- NuGet audit policy and the full vulnerable-package inventory: no findings.
- Prettier, agent harness validation, project tags, and lint/test across all
  22 targeted projects, including 120 web, 1 mobile, 91 BFF unit, and 11 BFF
  integration tests.
- Eight dependency compatibility tests and 14 deployment-workflow contract
  tests; no live Azure operations are part of these checks.
- Next.js production build, 84 web browser tests across Chromium, Firefox, and
  WebKit, and two mobile browser smoke tests. Browser checks use local fixtures,
  not live Okta accounts or an Azure deployment.

### November 12 compatibility servicing

Jest, babel-jest, and jest-environment-jsdom advance together to `30.5.2`.
The previous graph mixed Jest `30.4.1` owners with `jest-config@30.4.2` despite
their exact `30.4.1` requirements. The aligned owner update removes that invalid
resolution instead of adding a Jest-internal override.

The `glob@>=9 <14` override selects `14.0.5` for reviewed Jest, Expo, and
Istanbul callers. A matching `test-exclude@7.0.2` owner override is also needed
to prevent npm from retaining an invalid nested Glob 10 copy. These are
application-verified overrides outside the vendors' declared Glob ranges,
not vendor-endorsed upgrades. Glob 7/8 callers retain their original API and
Nx retains its separately required minimatch API. No dependency source is
patched. See the
[Glob changelog](https://github.com/isaacs/node-glob/blob/main/changelog.md).

The same exact `test-exclude@7.0.2` owner also selects `minimatch@11.0.8`.
Unlike Nx, this owner only uses the matching function, not the removed
`makeRe` API. Its coverage contracts verify inclusion, exclusion, negated
patterns, dotfiles, extensions, and rejection of paths outside the working
directory. The legacy `test-exclude@6` owner remains unchanged.

The new compatibility contracts enumerate every modern Glob caller from the
lockfile and fail on unreviewed owners. They check actual resolved versions,
legacy API preservation, synchronous/asynchronous/stream matches, ignored and
missing paths, cancellation, Expo workspace/Xcode discovery, and Istanbul
coverage exclusions. Remove the corresponding override once each owner
adopts a patched dependency, rerunning the contracts and application checks.

Registry and installed-source checks still find no compatible patched release
for three remaining dependency families:

- Nx `22.7.12` and the current major `24.0.6` still request
  `minimatch@10.2.5`. Nx calls `makeRe` in project selection, generator globbing,
  and release-tag matching. The patched minimatch 11 release removes that API.
  An Nx upgrade alone therefore does not remove this advisory, and a global
  minimatch override would break those paths. See the
  [upstream minimatch changelog](https://github.com/isaacs/minimatch/blob/main/changelog.md).
- Expo CLI `55.0.37` still requests Zod 3. Its optional MCP integration passes
  Zod schemas to `@expo/mcp-tunnel@0.2.4`, which constructs a Zod 3 object and
  uses `zod-to-json-schema`. A local contract probe confirms that a Zod 4 child
  schema inside that Zod 3 object throws `TypeError` during validation. Forcing
  only the CLI to Zod 4 would break this supported optional integration.
  Migrate the owner and MCP schema consumer together; do not disable the
  integration merely to make the audit pass. See the
  [Zod migration guide](https://zod.dev/v4/changelog).
- `deepmerge@4.3.1` remains the latest published version, with no patched
  release for its low-severity advisory.

These are dated observations, not permanent exceptions. Recheck the owner
releases and advisory ranges before the next remediation. No audit threshold,
allowlist, vendor source, or lifecycle-script approval is changed.

Local verification with Node `24.19.0` and npm `11.17.0` passed:

- Twelve dependency compatibility contracts; npm reports no invalid Glob,
  minimatch, or Jest config/runtime resolutions.
- NuGet's CI audit, Prettier, agent harness/source validation, project tags,
  and lint/test for all 22 targeted projects.
- 120 web tests (also rerun with coverage), one mobile test, 91 BFF unit
  tests, and 11 BFF integration tests.
- Next.js production build, 84 web browser tests, and two mobile browser
  smoke tests using local fixtures, not live Okta or Azure.
- Expo exports for web, Android, and iOS, plus 14 deployment-workflow
  contract tests that perform no live Azure operations.

The local `npm run audit:node` result remains failure on the minimatch and
Zod advisories. The low-severity deepmerge finding is tracked but below the
unchanged gate. A failed audit still blocks merge; successful behavior tests
do not waive that security requirement.

### Retired upstream security exception

As of September 4, 2026, npm reports
[`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
and
[`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
against the transitive `image-size` package used by Less through Nx's webpack
integration. The affected path is build tooling that processes
repository-controlled styles and assets; it is not bundled into the deployed
application runtimes and does not process customer uploads or request bodies.
At that time no patched `image-size` npm release was available; npm's suggested
forced remediation required a breaking Nx framework change.

The exceptions expired on October 4, 2026 and are removed in the October 15
servicing. The current advisory ranges no longer include Less's locked
`image-size@0.5.5`, and neither finding appears in the fresh scan. The current
advisories also identify patched `2.0.3`; no dependency is downgraded here.
`audit-ci.jsonc` now has an empty allowlist and continues to reject every
moderate-or-higher finding. Do not replace expired exceptions with module-wide
allowlisting, forced downgrades, or unpublished forks.

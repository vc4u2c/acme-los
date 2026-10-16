# Technology lifecycle baseline

This repository uses LTS channels where vendors publish them and supported
stable release trains where they do not. An upgrade is not considered complete
until the relevant compatibility matrix and repository verification pass.

## Current baseline

| Technology          | Repository baseline           | Support model                       | Version authority                       |
| ------------------- | ----------------------------- | ----------------------------------- | --------------------------------------- |
| Node.js             | 24.19.0                       | Krypton LTS                         | `.nvmrc` and `package.json`             |
| npm                 | 11.17.0                       | Node 24 bundled stable              | `package.json#packageManager`           |
| .NET / ASP.NET Core | 10.0.10 packages on `net10.0` | LTS through November 2028           | `apps/bff-api/Directory.Packages.props` |
| Next.js             | 16.3.8                        | Stable                              | `package-lock.json`                     |
| React               | 19.2.0                        | Stable, aligned to Expo SDK 55      | `package-lock.json`                     |
| TypeScript          | 5.9.3                         | Stable                              | `package-lock.json`                     |
| Nx                  | 22.7.10                       | Stable                              | `package-lock.json`                     |
| Expo                | 55.0.28                       | Supported Nx SDK train              | `package-lock.json`                     |
| React Native        | 0.83.10                       | Expo SDK 55 train                   | `package-lock.json`                     |
| Tailwind CSS        | 3.4.19                        | Stable NativeWind 4-compatible line | `package-lock.json`                     |
| NativeWind          | 4.2.6                         | Stable                              | `package-lock.json`                     |
| shadcn CLI          | 4.16.2                        | Stable; generated UI is app-owned   | `package-lock.json`                     |

Run `npm run sources:show` for the complete version-aware map to official docs
and upstream repositories.

The Expo app is declared as an npm workspace so Expo, npm, and EAS resolve the
root lockfile as the single dependency authority. Its Metro configuration uses
`expo/metro-config`; Nx then extends that config to make workspace libraries
resolvable and intentionally sets Metro's project root to the Nx workspace.

npm install scripts are fail-closed through `strict-allow-scripts` in `.npmrc`.
The version-pinned approvals in `package.json#allowScripts` cover reviewed
native binding and build-tool setup only. Less and protobufjs install scripts
are explicitly denied because neither is required to build or run this
repository. Any other dependency install script must fail until that exact
script and package version are reviewed.

## Deliberately gated migrations

- Expo SDK 57 is not adopted while Nx 22.7 documents support only for Expo SDK
  53 through 55. Upgrade Nx and Expo together after Nx publishes a compatible
  stable release.
- Tailwind CSS 4 is not adopted globally while stable NativeWind 4 remains on
  the Tailwind 3 integration. NativeWind 5 and its Tailwind 4 migration are
  currently documented as pre-release and are not a production baseline.
- Major upgrades for Redis clients, Wolverine, Microsoft.OpenApi, xUnit,
  coverlet, and gluestack are behavior migrations. They require focused release
  review and tests instead of being folded into runtime servicing.

## September 11 security servicing

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

## October 15 security servicing

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

## October 16 CSS parser compatibility

Two exact-owner overrides select the published `postcss-selector-parser@7.1.6`
release under `tailwindcss@3.4.19` and `postcss-nested@6.2.0`. This is an
application-verified compatibility override outside the vendors' declared
parser ranges, not a vendor endorsement or a Tailwind/NativeWind framework
upgrade. The prior installed copies were `6.1.4`; the earlier note identifying
them as `6.1.2` confused the dependency range minimum with the resolved version.

[Parser 7's iteration change](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0)
affects insertion during walks, used by
[Tailwind variant finalization](https://github.com/tailwindlabs/tailwindcss/blob/v3.4.19/src/util/formatVariantSelector.js).
The CI `Test CSS toolchain compatibility` step exercises actual installed
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
findings just to turn CI green. Deployment and teardown remain on hold.

## Retired upstream security exception

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

## Maintenance rules

1. Use LTS only for products that publish an LTS channel. Do not label ordinary
   library releases as LTS.
1. Keep LTS runtimes on the latest security servicing release.
1. Resolve framework versions from lockfiles and central package management,
   then consult version-matched primary sources.
1. Reject preview, beta, canary, and release-candidate dependencies in the
   production baseline unless an approved exception documents the risk.
1. Run `npm run agents:verify`, dependency audits, lint, tests, builds, and E2E
   checks before promotion.

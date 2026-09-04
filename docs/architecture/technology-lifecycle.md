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
| Next.js             | 16.3.0                        | Stable                              | `package-lock.json`                     |
| React               | 19.2.0                        | Stable, aligned to Expo SDK 55      | `package-lock.json`                     |
| TypeScript          | 5.9.3                         | Stable                              | `package-lock.json`                     |
| Nx                  | 22.7.8                        | Stable                              | `package-lock.json`                     |
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

## Time-bound upstream security exception

As of September 4, 2026, npm reports
[`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
and
[`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
against the transitive `image-size` package used by Less through Nx's webpack
integration. The affected path is build tooling that processes
repository-controlled styles and assets; it is not bundled into the deployed
application runtimes and does not process customer uploads or request bodies. No
patched `image-size` npm release is available. npm's suggested forced remediation
is a breaking Nx framework change and is not a safe patch-level security fix.

The two exact advisory paths are recorded in `audit-ci.jsonc` as active risk
exceptions that expire on October 4, 2026. The patched Metro `0.83.8` release is
pinned so mobile tooling is not excepted. `audit-ci` continues to fail on every
other moderate-or-higher advisory or any newly introduced path. Remove the
exceptions as soon as an official patched `image-size` release is available; do
not replace them with module-wide allowlisting, a forced downgrade, or an
unpublished fork.

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

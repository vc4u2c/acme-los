# Workspace Commands

This is the practical Nx command reference for the repo. It keeps the root README smaller while still preserving the commands people actually reach for.

## Windows Note

On Windows, prefer:

```powershell
npx.cmd nx ...
```

instead of:

```powershell
npx nx ...
```

That avoids the command-resolution issues we have seen in this repo on Windows shells.

## Core Nx Patterns

Run one target for one project:

```powershell
npx.cmd nx run <project>:<target>
```

Examples:

```powershell
npx.cmd nx run web-app:dev
npx.cmd nx run web-app:build
npx.cmd nx run mobile-app:start
```

Run one or more targets across many projects:

```powershell
npx.cmd nx run-many -t <target>
npx.cmd nx run-many -t <target1> <target2> --all
```

Examples:

```powershell
npx.cmd nx run-many -t lint
npx.cmd nx run-many -t test --all
npx.cmd nx run-many -t lint test --all --outputStyle=stream
```

## Common Web Commands

```powershell
npx.cmd nx run web-app:dev
npx.cmd nx run web-app:build
npx.cmd nx run web-app:lint
npx.cmd nx run web-app:test
npx.cmd nx run web-app-e2e:e2e
```

If you want the Redis-backed local web-state path:

```powershell
npx.cmd nx run web-app:dev-redis
npx.cmd nx run web-app:redis-down
```

## Common Mobile Commands

```powershell
npx.cmd nx run mobile-app:start
npx.cmd nx run mobile-app:serve
npx.cmd nx run mobile-app:run-android
npx.cmd nx run mobile-app:run-ios
npx.cmd nx run mobile-app:lint
npx.cmd nx run mobile-app:test --runInBand
npx.cmd nx run mobile-app-e2e:e2e
```

## Common Workspace Commands

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint
npx.cmd nx run-many -t test
npx.cmd nx run-many -t e2e
npx.cmd nx graph
npm run validate:tags
```

## Release Commands

```powershell
npm run release:dry-run
npm run release
```

## Good Defaults

For normal local verification:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue; Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue; npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

The default local web E2E lane runs Chromium and WebKit. Set
`ACME_E2E_ENABLE_FIREFOX=1` when you specifically want to include Firefox
locally; CI can include Firefox by setting `CI=true`.

## Why Keep This Doc?

Yes, this information exists in git history and old READMEs, but that is not a good developer experience.

The repo should preserve:

- the commands people use every week
- the command shape for Nx newcomers
- the Windows-specific `npx.cmd` note

This doc is the lightweight place to keep that knowledge current.

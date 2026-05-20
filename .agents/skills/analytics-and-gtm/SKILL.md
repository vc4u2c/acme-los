---
name: analytics-and-gtm
description: ACME LOS GA4/GTM analytics workflow. Use when changing analytics manifests, data layer events, GTM/GA4 setup docs, key events/goals, Measurement Protocol plans, custom reports, consent defaults, or debugging GA Realtime visibility.
---

# Analytics And GTM

Use this skill for ACME LOS product analytics. Keep Google admin work, runtime
config, and privacy controls cleanly separated.

## Read First

- `infra/analytics/README.md`
- `infra/analytics/events.json`
- `infra/analytics/environments/<env>.json`
- `apps/web-app/src/lib/analytics/data-layer.ts`
- `libs/core/analytics/src/index.ts`

## Rules

- Keep product analytics separate from Azure operational telemetry.
- Do not send PII, tokens, cookies, CSRF tokens, raw form payloads, or full URLs
  with query strings.
- Prefer app-owned event names and parameters over vendor-specific calls in
  feature code.
- Keep shared browser mechanics in `@acme-los/core/analytics`.
- Keep ACME LOS journey taxonomy in `apps/web-app/src/lib/analytics`.
- Treat `G-...` and `GTM-...` IDs as public configuration, but never commit
  Measurement Protocol API secrets, OAuth refresh tokens, or service-account
  keys.

## Common Workflow

1. Update `infra/analytics/events.json` for event taxonomy, custom dimensions,
   key-event candidates, or report recommendations.
2. Update `infra/analytics/environments/<env>.json` for environment IDs and
   consent defaults.
3. Update the web analytics builders/trackers only when the app needs to emit a
   new app-owned milestone.
4. Render and inspect:

```powershell
npm run analytics:render -- dev
npm run analytics:admin-plan -- dev
```

5. Update `infra/analytics/README.md` when manual GA4/GTM admin steps change.
6. Verify with local tests or GA Realtime depending on whether the change is
   code-only or admin/runtime.

## GTM Guidance

- Use one base Google tag with automatic page views disabled.
- Use a Custom Event trigger for app-owned `page_view`.
- For events marked as direct Google-tag dispatch in the admin plan, do not
  create duplicate GA4 Event tags unless a second vendor needs GTM routing.
- Mark only business outcomes as GA4 key events.

## Good Enterprise Defaults

- Separate GA4 properties and GTM containers per environment until `qa`, `stg`,
  and `prod` are mature.
- Keep `dev` analytics isolated from production reporting.
- Prefer source-generated admin plans over undocumented portal changes.
- Use Measurement Protocol later for server-observed auth callbacks and
  backend-only outcomes.

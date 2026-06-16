---
name: okta-web-auth-and-claims
description: Okta web auth, callback handling, claims, session storage, local/dev/qa mapping, and security-demo guidance for the acme-los repo. Use when changing Okta bootstrap manifests, callback URLs, token claims, session behavior, auth redirects, the web security inspector, or customerId and leadId handling.
origin: ACME LOS
---

# Okta Web Auth And Claims

Use this skill for `acme-los` authentication work where repo-specific callback, claim, and session behavior matters more than generic Okta guidance.

## Follow These Rules

- Keep auth correctness ahead of UX polish.
- Preserve the server-side auth flow: server-side PKCE start, server-side callback exchange, opaque session cookie, and tokens off the browser in the normal flow.
- Treat Okta bootstrap JSON and scripts as the source of truth, not manual tenant drift.
- Distinguish between raw token claims and app/session fallback values.

## Current Environment Mapping

- `local` -> Okta `dev`
- `dev` -> Okta `dev`
- `qa` -> Okta `qa`
- `stg` -> currently aligned with `qa` unless changed deliberately
- `prod` -> Okta `prod`

Use separate callback URLs per environment even when environments share the same Okta org/app.

## Read These Files First

- `infra/okta/README.md`
- `infra/okta/environments/dev.json`
- `infra/okta/environments/qa.json`
- `tools/scripts/okta/bootstrap-okta.mjs`
- `tools/scripts/okta/render-auth-config.mjs`
- `libs/api/web-server/src/lib/config.ts`
- `libs/api/web-server/src/lib/okta-auth-flow.ts`
- `libs/api/web-server/src/lib/auth-session.ts`
- `libs/api/web-server/src/lib/session-store.ts`
- `apps/web-app/src/components/web/security-inspector-dashboard.tsx`
- `docs/architecture/auth-and-api-contracts.md`
- `docs/architecture/current-platform.md`

## Working Pattern

1. Confirm which environment mapping is affected.
2. Inspect the Okta manifest plus the bootstrap/render scripts together.
3. Inspect the web-server config and auth/session code before changing callbacks or claims.
4. Decide whether data belongs in:
   - raw Okta token claims
   - server-side session state
   - temporary application/customer bridge state
5. Update docs when the real deployed behavior changes.

## Specific Guidance

### Claims

- `customerId` is a good candidate for a real profile-backed claim.
- `leadId` may be flow context rather than a stable identity attribute; do not force it into the token model without confirming that it is truly identity data.
- If the decoded JWT payload does not show a value, that usually means Okta did not mint it; app-side fallback does not change the raw token.

### Session Behavior

- Browser should hold only the opaque session cookie.
- Tokens belong in the server-side session store.
- In Azure `dev`, session and state storage live behind Redis.

### Callback And Redirects

- Local and Azure `dev` can share Okta `dev`, but callback and logout URLs must be environment-correct.
- Prefer runtime-aware server config for auth URLs over build-time-only assumptions.

### Hosted Sign-In Widget Gen3

- Treat `tools/scripts/okta/templates/hosted-sign-in-page.controller.js` as an
  inline hosted-page partial. It is source-controlled as a `.js` file, but
  `hosted-sign-in-page.html` inlines it inside the nonce-bearing `<script>` tag.
- Use Okta Gen3 `theme.tokens` for widget colors, typography, borders, focus,
  spacing, and radius. Do not style widget internals with Okta/MUI classes,
  `data-se` selectors, or post-render DOM rewrites.
- Keep shell theme and widget theme separate unless the widget surface itself is
  also proven dark. The ACME shell may be dark while Okta renders a light widget
  card; in that case use an accessible light widget token palette and set only
  the stable `#okta-login-container` wrapper to `color-scheme: light`.
- Use `oktaSignIn.afterTransform('*', ({ formBag }) => ...)` for Gen3 widget
  render customizations such as safe link shaping. Use `afterRender` only for
  shell context updates that do not mutate widget DOM.
- Run `npm run okta:audit-hosted-pages -- <env>` after hosted-widget changes;
  the audit must cover source conventions, route safety, and widget token
  contrast before publishing to Okta.

### Security Demo

- The security inspector is a diagnostic aid, not a permanent product surface.
- Keep its copy aligned with the actual hardening posture; do not leave stale “temporary” wording after architecture changes.

## Verification

When auth or claims change, prefer this set:

```powershell
npx.cmd prettier --check .
npx.cmd nx run-many -t lint test --all --outputStyle=stream
npx.cmd nx run web-app:build --skip-nx-cache
Remove-Item -Force apps/web-app/.next/dev/lock -ErrorAction SilentlyContinue
Remove-Item -Force apps/web-app/.next/lock -ErrorAction SilentlyContinue
npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache
```

If Azure `dev` or Okta manifests are part of the change, also verify the live callback URL and environment mapping before promotion.

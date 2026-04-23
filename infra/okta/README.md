# Okta Config In This Repo

This folder keeps the Okta setup intent in git.

For the repo-level quick start, start at [README.md](../../README.md) and [docs/getting-started/local-development.md](../../docs/getting-started/local-development.md). This README is only for the Okta admin plane.

Source of truth:

- `infra/okta/environments/dev.json`
- `infra/okta/environments/qa.json`
- `infra/okta/environments/stg.json`
- `infra/okta/environments/prod.json`
- `infra/okta/brand/acme-los.json`

Secrets do not live here.

Do not commit:

- Okta API tokens
- PEM private keys
- generated `.env.local` files
- generated `tmp/okta/*` files

## The Working Scripts

There are three practical Okta commands in this repo because they do different jobs.

## Which Command Should I Use?

Use this quick rule:

- want to generate local app config only -> `npm run okta:render -- <env>`
- want to create or update the dev Okta org -> `npm run okta:bootstrap -- <env>`
- want to remove the Okta apps for a clean-room retest -> `npm run okta:cleanup -- <env>`

If you are unsure, use `okta:bootstrap`.

### `npm run okta:render -- <env>`

Script:

- `tools/scripts/okta/render-auth-config.mjs`

Purpose:

- reads the git-tracked environment and brand files
- generates local app config files
- generates machine-readable artifacts for future BFF and Okta tooling

It does **not** call Okta.

Outputs:

- `apps/web-app/.env.local`
- `apps/mobile-app/.env.local`
- `tmp/okta/<env>.bff.authsettings.json`
- `tmp/okta/<env>.okta-hosted-branding.json`
- `tmp/okta/<env>.okta-applications.json`

### `npm run okta:bootstrap -- <env>`

Script:

- `tools/scripts/okta/bootstrap-okta.mjs`

Purpose:

- calls the live Okta Admin APIs
- uses a local `OKTA_API_TOKEN`
- bootstraps the dev org from the git-tracked config

This is the **current practical write path**.

It currently handles:

- web SPA app
- mobile native app
- trusted origin
- default-brand rename to a neutral fallback
- customer-brand creation or reuse
- customer-brand theme colors
- customer-brand hosted logo and favicon upload
- email authenticator activation/update
- customer group
- MFA enrollment policy
- global session policy
- app access policy
- password-first standard sign-in policy wiring
- adaptive high-risk 2FA policy wiring when the org supports Okta risk-based conditions
- policy assignment to the created apps

It also writes resolved IDs and client IDs back into the local generated files, and it updates the environment manifest when app client IDs are created.

Live dev org state last verified from the Admin API:

- web app exists and is active
- mobile app exists and is active
- localhost trusted origin exists with `CORS` and `REDIRECT`
- customer brand exists
- customer brand custom sign-in page exists
- customer brand custom error page exists
- `lead_id` and `customer_id` claims exist for both ID and access tokens
- custom profile attributes exist:
  - `leadId`
  - `customerId`
- email, password, and Okta Verify authenticators are active
- phone authenticator is still inactive

## Recommended Dev Flow

For local development, use this flow:

1. Update `infra/okta/environments/dev.json` and `infra/okta/brand/acme-los.json`
2. Render local config:

```powershell
npm run okta:render -- dev
```

3. Set a local Okta admin token:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
```

4. Bootstrap the dev org:

```powershell
npm run okta:bootstrap -- dev
```

5. Start the web app and test the hosted flow

This gives you the least manual work with the least amount of architectural weirdness.

If you want to prove the setup still works, rerun `okta:bootstrap` against the existing dev org first.
Only do a full delete-and-recreate test after that if you specifically want a clean-room bootstrap check.

Clean-room retest flow:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:cleanup -- dev
npm run okta:bootstrap -- dev
```

`okta:cleanup` deletes the web and mobile apps by default, clears the client IDs from the dev manifest, removes stale bootstrap outputs, and rerenders local env files so the repo stays honest.

## What Is Good About This Design

These parts are solid:

- config intent lives in git
- runtime app auth is separate from Okta admin bootstrap
- web, mobile, and future BFF settings come from the same environment file
- branding intent is kept in one shared file
- the bootstrap script is isolated to admin-plane setup, not runtime auth

## What Is Still Messy

The remaining awkwardness is that some deeper Okta plan and API surfaces still require a few manual checks or deferred work even though the repo now has one clear admin-plane path.

## What Is Still Manual Or Limited

Some things are still manual or limited by the Okta plan/API surface.

Current limitations:

- phone verification is deferred until telephony is set up
- the pre-auth "remember user" checkbox still needs one admin-console verification
- route-specific funding step-up still belongs in application runtime logic
- custom-domain linking is still a manual tenant step because DNS ownership and certificate validation happen outside the repo bootstrap
- profile-enrollment stays on the Okta system default rule because the rule API rejected automated replacement for the default/catch-all rule

That means:

- branding colors, logo, and favicon are automated
- hosted sign-in and error page HTML/content are automated after the custom domain is linked
- registration is working against the system default profile-enrollment rule, not a fully custom rule
- the current dev org already has the custom domain linked manually:
  - `auth.avanai.net`

Current auth shape in this repo:

- registration always requires password plus email enrollment because the MFA enrollment policy requires both authenticators
- standard sign-in is password-first
- adaptive sign-in, when the high-risk rule is supported and triggered, steps up to 2FA with password required as the first factor
- the funding step is still enforced in application runtime with `acr_values`,
  `prompt=login`, and `max_age=0`, which is the correct place for route-level
  step-up
- an existing `aal2` web session does not by itself unlock funding; the current
  server-side session needs the latest funding step-up marker, funding page
  entry consumes that marker, and funding APIs can use it during the bounded
  10-minute API window written by the latest Okta callback

## Current Admin Auth Path

Short version:

- use an **SSWS token** for local dev bootstrap right now

Why:

- the token path works today
- using the token only for admin bootstrap is acceptable
- using the token for runtime auth would be wrong, and we are **not** doing that

So the current recommendation is:

- local/dev bootstrap: `OKTA_API_TOKEN`

If you find an old admin service app in the Okta org that is not referenced by this repo, treat it as leftover infrastructure and remove it. It is not part of the current repo-driven bootstrap path.

## Files To Read First

If you want the simple mental model, read these in order:

1. `infra/okta/environments/dev.json`
2. `infra/okta/brand/acme-los.json`
3. `tools/scripts/okta/render-auth-config.mjs`
4. `tools/scripts/okta/bootstrap-okta.mjs`

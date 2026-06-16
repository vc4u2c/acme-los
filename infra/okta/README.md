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

There are several practical Okta commands in this repo because they do different jobs.

## Which Command Should I Use?

Use this quick rule:

- want to generate local app config only -> `npm run okta:render -- <env>`
- want to review policy hierarchy/scenarios before changing Okta -> `npm run okta:policy-plan -- <env>`
- want to create or update the dev Okta org -> `npm run okta:bootstrap -- <env>`
- want a read-only live Okta policy/security scan -> `npm run okta:audit-live -- <env>`
- want to remove the Okta apps for a clean-room retest -> `npm run okta:cleanup -- <env>`
- want to deactivate or delete non-allowlisted Okta users -> `npm run okta:prune-users -- <env> --dry-run`
- want to permanently delete exact Okta users -> `npm run okta:delete-users -- <env> --login <login> --dry-run`

If you are unsure, use `okta:bootstrap`.

### `npm run okta:render -- <env>`

Script:

- `tools/scripts/okta/render-auth-config.mjs`

Purpose:

- reads the git-tracked environment and brand files
- generates local app config files
- generates machine-readable artifacts for the BFF and Okta tooling

It does **not** call Okta.

Outputs:

- `apps/web-app/.env.local`
- `apps/mobile-app/.env.local`
- `tmp/okta/<env>.bff.authsettings.json`
- `tmp/okta/<env>.okta-hosted-branding.json`
- `tmp/okta/<env>.okta-hosted-pages.json`
- `tmp/okta/<env>.okta-applications.json`

### `npm run okta:policy-plan -- <env>`

Script:

- `tools/scripts/okta/policy-plan.mjs`

Purpose:

- reads `infra/okta/policy-scenarios.json`
- resolves the environment customer group and ACME app labels
- renders the Okta policy hierarchy, scenario matrix, scopes, automation status,
  and manual checks
- validates that customer policy is not scoped to Okta `Everyone`

It does **not** call Okta.

Outputs:

- `tmp/okta/<env>.policy-plan.json`
- `tmp/okta/<env>.policy-plan.md`

### `npm run okta:audit-live -- <env>`

Script:

- `tools/scripts/okta/audit-live-okta.mjs`

Purpose:

- calls the live Okta Admin APIs in read-only mode
- uses `OKTA_MANAGEMENT_ACCESS_TOKEN`, `OKTA_API_TOKEN`, or
  `--token-file <path>`
- compares live org/app/policy state to the git-tracked environment intent
- masks emails and phone numbers in generated output
- summarizes recent System Log SMS, phone, MFA, and inline-hook events without
  writing raw log payloads

Example:

```powershell
npm run okta:audit-live -- dev --token-file C:\secure\acme-los-okta-api-token.txt
```

Outputs:

- `tmp/okta/<env>.live-okta-audit.json`

Use this after bootstrap, after hosted-page changes, and whenever Okta
behavior looks different from the repo intent. A clean dev run should have no
`fail` checks and no actionable `warn` checks.

### `npm run okta:bootstrap -- <env>`

Script:

- `tools/scripts/okta/bootstrap-okta.mjs`

Purpose:

- calls the live Okta Admin APIs
- uses `OKTA_MANAGEMENT_ACCESS_TOKEN` when provided, with `OKTA_API_TOKEN` as a
  local dev fallback
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
- customer-brand hosted sign-in and error page content from the repo template
- customer-brand hosted sign-in page generation from
  `hostedExperience.signInWidgetGeneration` and the exact
  `hostedExperience.signInWidgetVersion`; `G3` is required, the version must be
  pinned to an Okta-supported hosted-widget version such as `7.46`, and
  bootstrap/audit verify Okta persisted both `widgetVersion` and
  `widgetCustomizations.widgetGeneration`
- email authenticator activation/update
- optional ACS-backed telephony inline-hook creation, update, activation, and
  rollback
- phone authenticator SMS activation with voice disabled when telephony is
  enabled
- customer group
- org-level email-as-username intent (`Map primary email to login attribute`)
  from `hostedExperience.mapPrimaryEmailToLogin`; bootstrap prints the desired
  state, but Okta does not expose a public API setter for this org setting
- profile-enrollment registration target group and required profile fields
  (`email`, `firstName`, `lastName`, `mobilePhone`, `acmeState`); email remains
  the customer login identifier, and the captured phone number is profile
  contact input until the phone/SMS authenticator is separately verified. The
  visible State field is scripted as the ACME-owned `acmeState` enum limited to
  Missouri and Texas plus a UI-schema select control because Okta's built-in
  base `state` attribute is a plain string field.
  If Okta marks the rule conditions read-only, bootstrap fails closed with a
  manual-required gate instead of broadening app assignment to `Everyone`
- customer-group-scoped MFA enrollment policy for password, email,
  security-question, and phone/SMS enrollment when telephony is enabled; `dev`
  requires phone/SMS because the mock provider is active
- customer-group-scoped global session policy with a 60-day maximum lifetime
  and 120-minute idle timeout
- app access policy
- password-first standard sign-in policy wiring
- adaptive high-risk/new-device 2FA policy wiring when the org supports Okta
  risk-based conditions
- Okta account-management policy rules for password, email, and phone/SMS
  lifecycle scenarios
- policy and customer-group assignment to the created apps

It also prints and writes a `policyPlan` summary that names each Okta policy,
its scope, and what it configures. It also prints and writes the resolved
`sessionAndAdaptivePolicyIntent` plus the account-management policy rule
payloads for the six customer account scenarios.
Resolved IDs and client IDs are written back into the local generated files, and
the environment manifest is updated when app client IDs are created.

Live dev org state last verified from the Admin API:

- web app exists and is active
- mobile app exists and is active
- localhost trusted origin exists with `CORS` and `REDIRECT`
- customer brand exists
- customer brand custom sign-in page exists
- customer brand custom sign-in page is configured for Sign-In Widget Gen 3
  through the Custom Pages API
- customer brand custom error page exists
- `lead_id` and `customer_id` claims exist for both ID and access tokens
- managed user profile attributes exist:
  - `leadId`
  - `customerId`
  - `mobilePhone` for Okta-hosted registration phone capture
  - `acmeState` for Okta-hosted registration State capture limited to Missouri
    and Texas
- profile-enrollment UI schema is scripted as `email`, `firstName`, `lastName`,
  `mobilePhone`, and `acmeState`; `acmeState` uses UI format `select`
- `hostedExperience.mapPrimaryEmailToLogin` is source-controlled as `true`;
  verify Okta Admin > Security > General > Organization > Map primary email to
  login attribute is Enabled because the public Okta org API does not expose a
  setter for this lifecycle switch
- profile-enrollment registration rule targets only `acme-los-customers-dev`;
  live rule fields match `email`, `firstName`, `lastName`, `mobilePhone`, and
  `acmeState`, and registration enrollment type includes `password`. Okta
  rejects public Policy API updates to that default rule with `E0000077`, so
  bootstrap treats a matching rule as existing and fails closed if those fields
  drift.
- email, password, and Okta Verify authenticators are active
- security-question enrollment is required by the ACME LOS authenticator policy
  for the `acme-los-customers-dev` customer group
- phone/SMS factor enrollment is required in `dev` through the repo-managed
  mock telephony provider; the hosted profile phone number remains contact
  metadata until the Okta phone/SMS authenticator is verified
- account-management lifecycle rules are repo-managed by bootstrap:
  - `ACME LOS Password Lifecycle (dev)`
  - `ACME LOS Email Lifecycle (dev)`
  - `ACME LOS Phone Lifecycle (dev)`
- phone authenticator can be enabled in `dev` through the repo-managed mock
  telephony provider for demos; this logs Okta-generated OTPs in dev app logs
  and does not send real SMS
- real ACS-backed SMS remains blocked until purchased sender `+18772244103` is
  toll-free verified and the Azure provider is enabled in the manifest

## Recommended Dev Flow

For local development, use this flow:

1. Update `infra/okta/environments/dev.json` and `infra/okta/brand/acme-los.json`
2. Render local config:

```powershell
npm run okta:render -- dev
```

3. Set local Okta management credentials. Prefer a scoped OAuth management
   access token for bootstrap; use an SSWS token only as a local dev fallback:

```powershell
$env:OKTA_MANAGEMENT_ACCESS_TOKEN='<scoped okta management access token>'
# or
$env:OKTA_API_TOKEN='<ssws token>'
```

4. Bootstrap the dev org:

```powershell
npm run okta:bootstrap -- dev
```

5. Run the read-only live audit:

```powershell
npm run okta:audit-live -- dev
```

6. Start the web app and test the hosted flow

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

### `npm run okta:prune-users -- <env>`

Script:

- `tools/scripts/okta/prune-okta-users.mjs`

Purpose:

- lists Okta users in an environment
- keeps only exact logins configured in `okta.userPrune.keepLogins`
- prepares a dry-run report by default
- deactivates non-allowlisted users only when `okta.userPrune.enabled` is
  `true` and `--confirm-deactivate` is passed
- permanently deletes non-allowlisted users only when
  `okta.userPrune.enabled` is `true`, `okta.userPrune.action` is `delete`,
  and `--confirm-delete` is passed
- refuses admin-role users and the API-token owner unless explicitly overridden

Delete mode always deactivates first, waits for Okta to report
`DEPROVISIONED`, and then deletes as a second pass. Okta deletion is
irrecoverable, so use delete mode only for throwaway dev/demo tenant cleanup
after checking the dry-run report.

Dry-run first:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:prune-users -- dev --dry-run
```

After verifying `tmp/okta/dev.user-prune.outputs.json`:

```powershell
npm run okta:prune-users -- dev --confirm-deactivate
```

For irreversible allowlist cleanup in dev only, set the manifest guard:

```json
"userPrune": {
  "enabled": true,
  "action": "delete",
  "keepLogins": [],
  "keepProfileContains": ["vinod", "gopi", "sasha"]
}
```

Then dry-run and confirm:

```powershell
npm run okta:prune-users -- dev --dry-run
npm run okta:prune-users -- dev --confirm-delete
```

### `npm run okta:delete-users -- <env>`

Script:

- `tools/scripts/okta/delete-okta-users.mjs`

Purpose:

- targets only exact login/email values passed with `--login`
- prepares a dry-run report by default
- deactivates each target, waits for `DEPROVISIONED`, then permanently deletes
  only when `--confirm-delete` is passed
- refuses admin-role users unless `--include-admins` is passed
- refuses the API-token owner unless `--allow-token-owner` is passed

Dry-run first:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:delete-users -- dev --login user@example.com --dry-run
```

After verifying `tmp/okta/dev.user-delete.outputs.json`:

```powershell
npm run okta:delete-users -- dev --login user@example.com --confirm-delete
```

## What Is Good About This Design

These parts are solid:

- config intent lives in git
- runtime app auth is separate from Okta admin bootstrap
- web, mobile, and BFF settings come from the same environment file
- branding intent is kept in one shared file
- the bootstrap script is isolated to admin-plane setup, not runtime auth

## What Is Still Messy

The remaining awkwardness is that some deeper Okta plan and API surfaces still require a few manual checks or deferred work even though the repo now has one clear admin-plane path.

## What Is Still Manual Or Limited

Some things are still manual or limited by the Okta plan/API surface.

Current limitations:

- real ACS phone verification is deferred until the source-supported ACS
  telephony path is activated; `dev` can require phone/SMS through the
  repo-managed mock telephony provider for demos. Follow
  [Okta SMS MFA with Azure Communication Services](../../docs/operations/okta-sms-mfa-with-acs.md)
- customer account-security policy intent, backend profile sync, and the manual
  account-management policy checks are documented in
  [Okta account security and profile sync](../../docs/operations/okta-account-security-and-profile-sync.md)
- device assurance, device signal collection, and deeper device-risk controls
  are Okta org features; bootstrap scopes their consumption through ACME app
  policy where Okta allows it and the runbook documents what cannot be
  app-scoped directly
- the hosted sign-in page intentionally hides Okta's pre-auth "remember user"
  checkbox; customer session lifetime and remember-device behavior stay
  policy-driven
- route-specific funding step-up still belongs in application runtime logic
- custom-domain linking is still a manual tenant step because DNS ownership and certificate validation happen outside the repo bootstrap
- profile-enrollment uses the Okta-managed catch-all rule, but bootstrap now
  updates that rule to target the ACME LOS customer group; if Okta rejects that
  update, bootstrap fails closed instead of broadening customer enrollment to
  admins through `Everyone`

That means:

- branding colors, logo, and favicon are automated
- hosted sign-in and error page HTML/content are automated by
  `tools/scripts/okta/hosted-sign-in-page.mjs` after the custom domain is linked
- the Okta-hosted page templates live in `tools/scripts/okta/templates`; the
  sign-in template uses an ACME-styled Gen 3 shell while keeping Okta in charge
  of all credential, registration, recovery, and authenticator controls
- hosted sign-in is locked to Okta Sign-In Widget Gen 3 and pinned to the exact
  version in `hostedExperience.signInWidgetVersion`. Okta documents Gen 3 as
  Okta-hosted only, so ACME keeps redirect auth through Okta and does not
  self-host or embed the widget in Next.js. The current repo template avoids
  Gen 2 class-name DOM overrides and custom form controls; ACME styling is
  limited to the surrounding shell plus scoped form/control normalization, and
  the controller only selects supported widget flows for forgot-password,
  unlock-account, and signup entry. If you need the matching Admin Console
  check, go to
  `Customizations > Brands > ACME LOS Customer > Pages > Sign-in page > Settings > Sign-In Widget version`
  and verify `Use third generation` is active, the configured widget version
  matches the manifest, and the page is published.
- hosted registration is controlled by the Okta profile-enrollment policy/rule
  assigned to the app. If the sign-up link is missing, verify that profile
  enrollment targets `acme-los-customers-<env>` and registration is enabled for
  the app.
- password policy controls password requirements and lifecycle behavior; it
  does not control whether the hosted Gen 3 registration form shows a
  repeat/confirm-password field. ACME does not inject browser-only credential
  fields into the hosted page. If a true confirm-password field becomes a hard
  requirement, build an embedded/custom IDX registration experience instead of
  patching the Okta-hosted DOM.
- hosted-page behavior is checked locally with
  `npm run okta:audit-hosted-pages -- <env>`; the audit renders the styled Gen
  3 shell and verifies that sign-in, signup, forgot-password, and
  unlock-account widget flows initialize without dead hosted/help routes.
- theme persistence uses only the non-sensitive `acme_theme=light|dark`
  preference cookie; when the app runs at a sibling `*.avanai.net` hostname,
  the cookie is scoped to `avanai.net` so theme follows the redirect round trip
- auth session, state, CSRF, and token cookies remain host-scoped and are never
  shared with the Okta hostname
- registration must target `acme-los-customers-<env>` through the
  profile-enrollment rule; in Okta orgs that reject API updates to that
  Okta-managed rule, set the target group manually and rerun bootstrap
- the current dev org already has the custom domain linked manually:
  - `auth.avanai.net`
- the current dev org uses `https://integrator-9373984.okta.com` as the
  source-controlled `okta.orgUrl` for end-user settings links because the
  custom auth domain serves hosted sign-in/error pages but not the end-user
  settings app
- the `dev` manifest prepares `https://apply-dev.avanai.net` as an allowed
  origin, but theme continuity from app to Okta is not live until that hostname
  is DNS-validated, enabled through the Bicep-managed web custom-domain
  deployment, and made the deployed web base URL

Current auth shape in this repo:

- registration requires password, email, security-question, and phone/SMS
  enrollment for `dev` users in the ACME LOS customer group because the MFA
  enrollment policy requires those authenticators for that group; higher
  environments keep phone/SMS disabled until a sender/provider rollout is ready
- Okta-hosted registration captures email, first name, last name, profile phone
  number, and visible State in profile enrollment; State is backed by the
  ACME-owned `acmeState` dropdown limited to Missouri and Texas.
  Password and password requirements are Okta password authenticator enrollment,
  not ACME profile fields. Confirm/repeat-password display is controlled by the
  Okta hosted widget/org behavior, not by the ACME profile-enrollment schema.
  Okta may still render password, email OTP, phone OTP, and security-question
  enrollment as follow-up hosted steps.
- Okta `sub` is the immutable ACME user key; email is mutable metadata synced to
  backend profile storage after a fresh Okta session
- ACME account-security pages use Okta user-scoped MyAccount APIs for
  signed-in password, email, and phone changes; forgot-password recovery remains
  in the Okta-hosted Gen3 widget
- account management uses opposite-channel proofing: password and email
  lifecycle actions require phone/SMS OTP plus security question, while
  phone/SMS lifecycle actions require email OTP plus security question
- after email changes, ACME syncs the new email only after fresh sign-in with
  the new email and email OTP; after phone/SMS changes, ACME syncs verified
  phone metadata only after fresh sign-in with the unchanged email and the new
  phone/SMS OTP
- customer global session policy has a 60-day maximum lifetime and a
  120-minute idle timeout for the ACME LOS customer group
- standard sign-in is password-first
- adaptive sign-in, when the high-risk/new-device rule is supported and
  triggered, steps up to 2FA with password required as the first factor; it
  does not use security-question challenge/hint during sign-in
- the funding step is still enforced in application runtime with `acr_values`;
  when `hostedExperience.fundingStepUpRequiresPassword=false`, the app does not
  send `max_age=0`, so Okta can step up the existing SSO session with a
  possession OTP instead of asking for the password again. The configured
  funding policy accepts one Okta possession OTP factor: email or phone/SMS
- an existing `aal2` web session does not by itself unlock funding; the current
  server-side session needs the latest funding step-up marker, the callback
  must include Okta `amr` evidence for email or phone/SMS OTP, funding page
  entry consumes that marker, and funding APIs can use it during the bounded
  10-minute API window written by the latest Okta callback

## Current Admin Auth Path

Short version:

- prefer `OKTA_MANAGEMENT_ACCESS_TOKEN` for `okta:bootstrap`
- use `OKTA_API_TOKEN` as the local dev fallback and for cleanup/prune scripts

Why:

- Okta recommends scoped OAuth 2.0 management access tokens over broad API
  tokens for Management APIs
- the bootstrap code now accepts a bearer token and falls back to SSWS only when
  no bearer token is provided
- using the token for runtime auth would be wrong, and we are **not** doing that

So the current recommendation is:

- local/dev bootstrap: `OKTA_MANAGEMENT_ACCESS_TOKEN`
- cleanup and guarded dev-user pruning: `OKTA_API_TOKEN`

`okta:bootstrap` updates an existing OIDC application in place when redirect
or logout URI configuration changes. Do not delete and recreate a live web
client simply to add a branded hostname, because that rotates its client ID
and requires an immediate application redeploy.

If you find an old admin service app in the Okta org that is not referenced by this repo, treat it as leftover infrastructure and remove it. It is not part of the current repo-driven bootstrap path.

## Files To Read First

If you want the simple mental model, read these in order:

1. `infra/okta/environments/dev.json`
2. `infra/okta/brand/acme-los.json`
3. `tools/scripts/okta/render-auth-config.mjs`
4. `tools/scripts/okta/bootstrap-okta.mjs`
5. `tools/scripts/okta/hosted-sign-in-page.mjs`

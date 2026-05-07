# Analytics Admin Plane

This folder keeps the intended Google Analytics 4 and Google Tag Manager setup
in git. It follows the same philosophy as `infra/okta`: manual tenant/account
steps are called out plainly, while environment intent and generated local
configuration stay repo-owned.

Source of truth:

- `infra/analytics/environments/dev.json`
- `infra/analytics/environments/qa.json`
- `infra/analytics/environments/stg.json`
- `infra/analytics/environments/prod.json`
- `infra/analytics/events.json`

Secrets do not live here.

Do not commit:

- GA4 Measurement Protocol API secrets
- Google OAuth refresh tokens or service-account keys
- generated `tmp/analytics/*` files
- exported GTM container JSON that contains unreviewed vendor tags

## What Is Manual

The first Google setup is tenant/account work, similar to Okta custom-domain and
admin-token setup.

The repo can render environment intent now, but it cannot create Google
accounts, accept Google organization terms, choose billing/ownership, or publish
GTM containers without an approved Google admin credential model. That is the
same split we use for Okta: external tenancy is deliberate, and app/runtime
configuration stays repeatable from source.

Manual steps:

1. Create or choose the Google account or Google Marketing Platform organization
   that will own ACME LOS analytics.
2. Create a Google Analytics account if one does not already exist.
3. Create GA4 properties per environment, or one property with environment
   streams. For this repo, separate environment properties are easiest to reason
   about while `dev`, `qa`, `stg`, and `prod` mature.
4. Create one Web data stream per deployed web origin.
5. Copy each stream's `G-...` Measurement ID into the matching
   `infra/analytics/environments/<env>.json`.
6. Create a Google Tag Manager account and Web container per environment, or one
   account with environment-specific containers.
7. Copy each `GTM-...` container ID into the matching manifest.
8. In GTM, create environments named `dev`, `qa`, `stg`, and `live` as needed.
9. Configure consent mode defaults so analytics and ads storage start denied
   until the app's consent UI grants them.
10. Add a GA4 tag in GTM using the environment's Measurement ID.
11. Add dataLayer custom-event triggers for the app-owned event names in
    `events.json`.
12. In GA4 Admin, mark the selected business events as key events.
13. Optional: create a Measurement Protocol API secret for server-side auth,
    callback, and route-handler events. Store that secret in Key Vault or
    environment secrets, not in this folder.
14. Run `npm run analytics:render -- <env>` and copy the generated web env
    values into the matching local or Azure runtime configuration only after
    the real `G-...` and `GTM-...` values are present.

Current repo stance:

- analytics is disabled in all manifests until real IDs exist
- the app should load GTM only through environment variables rendered from these
  manifests
- business telemetry and Azure operational telemetry remain separate systems

## Repo-Owned Render Step

Render an environment config:

```powershell
npm run analytics:render -- dev
```

Outputs:

- `tmp/analytics/dev.analytics.json`
- `tmp/analytics/dev.web.env`

The renderer does not call Google APIs. It gives the same kind of controlled
local output that `okta:render` gives for auth config.

## Future Bootstrap Path

A later `analytics:bootstrap` script can use the Google Analytics Admin API and
Tag Manager API once the organization chooses the admin credential model.

Recommended shape:

- use a dedicated Google Cloud project for analytics admin automation
- use least-privilege OAuth or service-account access where Google supports the
  target API
- prefer an app-owned bootstrap script that reads these manifests and creates
  or updates GA4 properties, web streams, GTM containers, GTM environments, and
  baseline triggers
- keep account and property IDs in generated outputs, not hard-coded app code
- keep Measurement Protocol API secrets in Key Vault for Azure and local secret
  stores for developer runs
- keep GTM workspace changes reviewable before publishing

Until that exists, treat the manual Google Console setup as the source of the
external account IDs, and this folder as the repo-owned app/environment intent.

## Data Layer Contract

Use a single app-owned `dataLayer` contract. Feature code should emit ACME LOS
events, not vendor-specific tag calls.

Required base fields:

- `event`
- `event_id`
- `environment`
- `page_location`
- `page_title`
- `page_path`
- `route_group`
- `rendering_mode`
- `auth_state`
- `assurance_level`
- `journey_name`

Application fields:

- `application_step`
- `offer_type`
- `step_up_reason`
- `result`

Never send:

- names
- emails
- phone numbers
- addresses
- SSNs or national IDs
- raw Okta tokens
- auth cookies
- CSRF tokens
- full form payloads
- full URLs containing query strings with auth state

## Page Tracking

Static pages:

- emit one `page_view` after hydration
- include `rendering_mode=static`
- route examples: `/`, `/rates-terms`, legal pages

Dynamic server-rendered pages:

- emit one browser `page_view` after the page is visible
- server route handlers may emit supplemental server events for auth or business
  outcomes that are not observable in the browser
- include `rendering_mode=server`

Client transitions:

- emit a new `page_view` when the pathname changes
- avoid duplicate initial `page_view` events from both GTM defaults and app code

Server routes:

- do not run GTM
- send carefully allowlisted server events through Measurement Protocol only
  when there is a business reason
- include an event id so downstream analytics can deduplicate when a browser
  event and a server event describe the same journey milestone

## Event And Key Event Candidates

Use `infra/analytics/events.json` as the first taxonomy.

Good first GA4 key-event candidates:

- `application_start`
- `application_step_complete`
- `preapproval_offer_selected`
- `funding_step_up_completed`
- `sign_in_completed`

Keep lower-level diagnostics, health checks, and security-inspector activity out
of marketing analytics. Those belong in Application Insights and Log Analytics.

## Environment Design

Use one of these models:

- Recommended now: separate GA4 properties and GTM containers per environment.
- Later option: one GA4 property with environment dimensions and filtered
  reports.

Separate properties are clearer while `dev`, `qa`, `stg`, and `prod` are being
stood up because accidental dev events cannot pollute production reporting.

## References

- Google Tag Manager data layer:
  https://developers.google.com/tag-platform/tag-manager/datalayer
- Google tag page view behavior:
  https://developers.google.com/tag-platform/gtagjs/configure
- GA4 events:
  https://developers.google.com/analytics/devguides/collection/ga4/events
- GA4 Measurement Protocol:
  https://developers.google.com/analytics/devguides/collection/protocol/ga4
- Google consent mode:
  https://developers.google.com/tag-platform/security/guides/consent

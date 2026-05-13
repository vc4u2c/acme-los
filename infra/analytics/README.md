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
- `apps/web-app/src/lib/analytics/*`
- `apps/web-app/src/components/web/analytics/*`

Secrets do not live here.

Do not commit:

- GA4 Measurement Protocol API secrets
- Google OAuth refresh tokens or service-account keys
- generated `tmp/analytics/*` files
- exported GTM container JSON that contains unreviewed vendor tags

Safe to commit:

- GA4 Measurement IDs such as `G-...`
- GTM container IDs such as `GTM-...`
- Google account, property, stream, container, and environment names
- public web origins and consent-default intent

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
14. Run `npm run analytics:render -- <env>` for local inspection or `.env.local`
    setup only after the real `G-...` and `GTM-...` values are present. Azure
    deployment reads the environment manifests directly.

Current repo stance:

- analytics is enabled only for environments with real Google IDs
- the web app loads GTM or direct GA4 only when analytics is enabled and a valid
  Google ID is configured
- business telemetry and Azure operational telemetry remain separate systems

## Dev GA4 And GTM Setup Log

Dev analytics was wired on 2026-05-13 with separate dev GA4 and GTM resources.
The Google IDs below are public browser configuration values and are safe to
commit. Do not commit Measurement Protocol API secrets.

Google Analytics:

- Account: `ACME`
- Property: `ACME LOS Dev`
- Web stream URL:
  `https://ca-acme-los-web-dev-cus-01.delightfuldune-52ae35d1.centralus.azurecontainerapps.io`
- Measurement ID: `G-WHC2KRFRTK`

Google Tag Manager:

- Account: `ACME`
- Web container: `ACME LOS Web Dev`
- Container ID: `GTM-T5B2T2N4`

Expected dev GTM workspace setup:

1. Base Google tag
   - Name: `GA4 - Google tag - Dev`
   - Tag type: `Google tag`
   - Tag ID: `G-WHC2KRFRTK`
   - Configuration setting: `send_page_view=false` when the UI exposes it
   - Trigger: `Initialization - All Pages`
2. App page-view event trigger
   - Name: `Custom Event - page_view`
   - Trigger type: `Custom Event`
   - Event name: `page_view`
   - Fires on: `All Custom Events`
3. App page-view GA4 event tag
   - Name: `GA4 Event - page_view - Dev`
   - Tag type: `Google Analytics: GA4 Event`
   - Configuration tag or Measurement ID: `GA4 - Google tag - Dev` or
     `G-WHC2KRFRTK`
   - Event name: `page_view`
   - Trigger: `Custom Event - page_view`

Recommended event parameters for the `page_view` event tag are data layer
variables matching the app-owned event contract:

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
- `application_step`

Repo changes for dev:

- `infra/analytics/environments/dev.json` sets `enabled=true`
- `infra/analytics/environments/dev.json` stores `G-WHC2KRFRTK` and
  `GTM-T5B2T2N4`
- `npm run analytics:render -- dev` renders ignored runtime files under
  `tmp/analytics`

Current caveat:

- GTM Preview was intentionally skipped during initial setup because dev Azure
  was paused and runtime settings were not yet deployed. Verify with Tag
  Assistant after dev is resumed/deployed, or with local env vars that load the
  dev GTM container.

## Runtime Integration

The Next app now has a runtime analytics layer:

- `AnalyticsScripts` initializes `window.dataLayer`, pushes Google consent
  defaults, and loads GTM when `NEXT_PUBLIC_ACME_GTM_CONTAINER_ID` is present
- if GTM is not configured but `NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID` is present,
  it falls back to direct Google tag mode with automatic page views disabled
- `AnalyticsRouteTracker` emits one app-owned `page_view` event after hydration
  and on client route changes
- page events intentionally use origin + pathname only; query strings, hashes,
  tokens, cookies, and form payloads are not sent
- CSP opens Google script/connect endpoints only when analytics is enabled and
  configured

Runtime environment variables:

```text
NEXT_PUBLIC_ACME_ANALYTICS_ENABLED=true
NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT=dev
NEXT_PUBLIC_ACME_GTM_CONTAINER_ID=GTM-...
NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID=G-...
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE=denied
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE=denied
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA=denied
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION=denied
```

Recommended runtime mode is GTM mode. Keep the GA4 Measurement ID in the
manifest so GTM and future Measurement Protocol automation know the intended
stream, but let GTM load the browser tag so feature code only pushes app-owned
events.

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

After real Google IDs are in the environment manifest, append or copy the
generated `tmp/analytics/<env>.web.env` values into local `.env.local` when
testing locally. Azure deploys read `infra/analytics/environments/<env>.json`
directly and pass analytics values into the web image build and Container App
runtime environment.

## Local Admin Token File

Google admin automation should use a local token file or environment variable,
not a committed secret.

Supported local inputs:

```powershell
$env:GOOGLE_ANALYTICS_ADMIN_TOKEN='<short-lived access token>'
```

or:

```powershell
$env:ACME_GOOGLE_ADMIN_TOKEN_FILE='C:\Users\<you>\.acme-los\google-admin-token.txt'
```

Check that the repo can resolve the token without printing it:

```powershell
npm run analytics:check-admin-token
```

The current runtime does not need this admin token. It is reserved for future
Google Admin API or Tag Manager API automation, the same way
`OKTA_API_TOKEN` is reserved for Okta admin bootstrap and never used by the app
runtime.

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
  when there is a business reason; this remains a future server-side analytics
  step
- include an event id so downstream analytics can deduplicate when a browser
  event and a server event describe the same journey milestone

## GTM Container Setup

Use the app-owned `dataLayer` event names rather than page-specific custom
scripts.

Recommended first container setup:

1. Create one GA4 Google tag or GA4 configuration tag using the environment's
   Measurement ID.
2. Disable automatic page-view sending for that base tag if the UI exposes that
   option.
3. Create a Custom Event trigger for `page_view`.
4. Create a GA4 Event tag for `page_view`.
5. Map data layer variables for:
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
   - `application_step`
6. Create Custom Event triggers for the other names in `events.json`.
7. Mark only the chosen business outcomes as GA4 key events.

Do not add vendor tags that collect form fields, tokens, cookies, or full URLs
with query strings.

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

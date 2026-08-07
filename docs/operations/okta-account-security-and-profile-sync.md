# Okta Account Security And Profile Sync

This runbook describes the customer account-security model for the app-owned
IDX web experience, Okta MyAccount mutations, and recovery policy.

Okta Integrator Admin org: <https://integrator-9373984.okta.com/>

## Security Model

Okta is the source of truth for identity and authentication. ACME backend
systems are the source of truth for customer and lending records.

- Okta `sub` is the immutable user key.
- Email is mutable contact and login metadata.
- Registration email is the customer login identifier in the app-owned IDX
  flow.
- Registration phone is captured once during Okta phone/SMS authenticator
  enrollment, not on the Okta profile-enrollment form. Okta phone/SMS becomes
  trusted only after the customer explicitly requests a code and verifies the
  phone/SMS authenticator.
- The visible `State` registration field is user-provided profile metadata
  stored in the ACME-owned Okta attribute `acmeState`; it is not minted into
  tokens unless a future backend contract explicitly needs it.
- `customerId` and `leadId` are backend business identifiers written to Okta
  only by trusted server-side automation.
- Passwords, OTPs, security-question answers, and security-question hints never
  sync to ACME.

## Source-Controlled Policy Intent

`infra/okta/policy-scenarios.json` is the source-supported policy hierarchy and
scenario contract. Render it with:

```powershell
npm run okta:policy-plan -- dev
```

`tools/scripts/okta/bootstrap-okta.mjs` also emits the resolved `policyPlan`,
`sessionAndAdaptivePolicyIntent`, and `accountSecurityPolicyIntent` during
dry-run and live bootstrap.

The intended IDX registration profile enrollment captures these required
fields:

- email: used as the login identifier
- first name
- last name
- state: supported state code captured on the Okta user profile as `acmeState`
  and rendered as a dropdown limited to Missouri and Texas

Password is not a profile-enrollment attribute. ACME configures password as
required Okta password-authenticator enrollment and records the profile
enrollment rule's password enrollment type when Okta exposes it. Okta owns
password entry, password requirements, confirm-password behavior when present,
and any password-policy messaging in the IDX remediation.

Dev desired state: bootstrap creates/updates `acmeState` with only Missouri and
Texas enum values. The profile-enrollment rule and UI schema both use `email`,
`firstName`, `lastName`, and `acmeState`; `acmeState` renders as `select`, the
rule targets
`acme-los-customers-dev`, and the registration enrollment type includes
`password`. Okta still rejects public Policy API updates to this default rule
with `E0000077` (`conditions` read-only), so bootstrap treats a matching live
rule as existing and fails closed if the field list drifts.

Bootstrap records this desired state from
`okta.hostedExperience.mapPrimaryEmailToLogin`, emits it in
`accountSecurityPolicyIntent.orgLevelSettings`, and prints it during dry-run and
live bootstrap. Okta's public Org General Settings API does not expose a safe
setter for this lifecycle switch, so verify the Admin Console value:

1. In Okta Admin, go to **Security > General**.
2. Scroll to **Organization**.
3. Set **Map primary email to login attribute** to **Enabled**.
4. Save.

This setting makes `profile.login` follow `profile.email` for new
self-service registration users. It doesn't rewrite existing users by itself;
the ACME BFF therefore performs an app-controlled post-verification login sync
for change-email flows after Okta verifies the new primary email OTP.
`npm run okta:audit-live -- <env>` fails if customer-group users have
different `login` and `email` values.

For a deliberate dev/demo tenant repair, use the scoped Okta service app rather
than an SSWS token:

```powershell
node tools/scripts/okta/sync-user-login-email.mjs dev --user-id "<audited okta user id>" --private-key-pem-path "C:\secure\acme bff management.pem"
node tools/scripts/okta/sync-user-login-email.mjs dev --user-id "<audited okta user id>" --private-key-pem-path "C:\secure\acme bff management.pem" --confirm
```

The script only touches users in `acme-los-customers-<env>`, defaults to
dry-run, and requires `okta.users.read okta.users.manage`. If the service app
also has group-read permission, use `--all-customers`; otherwise pass explicit
user IDs reported by the latest live audit.

The intended initial hosted-registration authenticator enrollment is:

- password: required
- email: required
- security question: required
- phone/SMS: required in `dev` through the mock telephony provider; phone is
  entered and verified on the Okta phone/SMS authenticator enrollment screen,
  not collected separately as a profile field

The intended session and adaptive sign-in posture is:

- Customer global session policy: scoped to `acme-los-customers-<env>`, 60-day
  maximum session lifetime, 120-minute idle timeout, and keep-me-signed-in
  behavior from the environment manifest.
- App sign-in policy: assigned only to ACME LOS web and mobile OIDC apps.
- Standard app sign-in: password-first.
- High-risk or new-device sign-in: Okta risk score `HIGH` requires
  password-first 2FA, with keep-me-signed-in disabled for that event.
- Security question is not required during app sign-in or routine signed-in
  account changes. It is reserved for recovery.
- Device assurance and device signal collection are Okta org features. When
  the org supports them, ACME scopes their use through the app sign-in policy;
  if the org cannot support or accept those rules, the limitation must be
  recorded explicitly instead of broadening customer policy.

The intended sensitive-change and recovery scenarios are:

- Change email: require current password plus phone/SMS OTP before sign-off,
  then require sign-in with the new email and email OTP before ACME syncs the
  mutable email claim.
- Forgot password: require phone/SMS OTP plus the Okta security-question
  challenge/hint before reset, then sign out and require sign-in with the new
  password. The customer-scoped `ACME LOS Password Policy (<env>)` rule must
  allow self-service password reset with SMS as the primary recovery method when
  telephony is enabled and `accessControl=AUTH_POLICY`; the Okta Account
  Management policy then owns the security-question and OTP proof requirements.
- Change password: require current password plus phone/SMS OTP before the
  mutation, then sign out and require a fresh ACME sign-in with the new
  password plus phone/SMS OTP.
- Lost phone/SMS factor: require email OTP plus the Okta security-question
  challenge/hint, then allow phone replacement and require a fresh ACME sign-in
  with the unchanged email and the new phone/SMS OTP before any verified-phone
  sync.
- Change phone/SMS: require current password plus email OTP before sign-off,
  then require a fresh ACME sign-in with the unchanged email and the new
  phone/SMS OTP before any verified-phone sync.

## Backend Sync

Email/login sync is split between Okta and ACME:

The BFF receives `ACME_OKTA_ISSUER` and the exact canonical tenant URL in
`ACME_OKTA_ORG_URL` from the environment manifest through Bicep. The issuer is
used for customer authorization; the canonical org URL is used for scoped Okta
Management API calls and is the only allowed issuer alias for custom-domain ID
tokens. These URLs are non-secret. The OAuth service-app private key remains a
Key Vault secret reference and is never emitted into browser configuration.

1. New self-service registration users rely on Okta's org-level **Map primary
   email to login attribute** setting so `profile.login` starts as the email.
2. Change-email users call Okta MyAccount with their own scoped access token.
   ACME creates the primary email transaction with `sendEmail=false`, then sends
   the email challenge only after the customer clicks the ACME button.
3. After Okta verifies the new-email OTP, the BFF reads the verified email back
   from MyAccount and, when `ACME_OKTA_EMAIL_LOGIN_SYNC_ENABLED=true`, uses the
   Key Vault-backed Okta service app to update that same Okta user's
   `profile.email` and `profile.login` to the verified value.
4. The customer must sign in again with the new email so Okta issues fresh
   tokens and ACME starts a clean secure session.

Customer-profile email sync is then implemented on the customer-profile read
path:

1. User changes email from the ACME account-security email page.
2. User refreshes the ACME secure session through the normal Okta redirect.
3. ACME receives a new ID token for the same Okta `sub`.
4. The profile API compares the stored backend email with the current Okta
   email claim.
5. If the values differ, ACME updates the stored customer profile email and
   logs `customer.profile.email_changed`.

The log intentionally records the event and user context, not the old or new
email value.

Phone/SMS sync uses Okta MyAccount phone read with the active user's
server-side access token:

1. User signs in through the app-owned Okta IDX flow and completes phone/SMS
   enrollment or verification.
2. The BFF reads the server-side session token from Redis or the in-memory
   session store. The browser never receives that token.
3. The BFF calls `GET /idp/myaccount/phones` with
   `okta.myAccount.phone.read`.
4. If Okta returns a `VERIFIED` phone, ACME displays it on the read-only
   customer dashboard and syncs it to the customer profile record without
   logging the number.

This is a user-scoped MyAccount read, not a super/admin Users API lookup.
If the token is missing the phone-read scope, expired, or not for the same Okta
`sub` as the trusted Next-to-BFF identity header, ACME leaves the dashboard
phone empty or falls back to the existing stored profile phone.

No inbound Okta Event Hook is currently enabled for email, phone, password, or
security-question changes. The implemented email claim/customer-profile sync
happens after a fresh ACME session; the implemented phone sync happens after a
fresh session with a verified Okta MyAccount phone. Passwords, OTPs, and
security-question material never sync.

## Application Customer ID Write-Back

The application flow has a source-supported, opt-in sample bridge for proving
Okta profile claim round trips before the real customer system exists.

When the user saves the `personal-info` step and the current Okta session does
not already include `customerId`, the Next facade validates the browser session
and forwards trusted identity to the internal BFF. The BFF can then:

1. validate CSRF and the trusted Next-to-BFF boundary
2. obtain an Okta Management API access token with an OAuth service app using
   private-key JWT client authentication
3. read the current Okta user profile through the Okta Users API
4. preserve an existing `profile.customerId` if Okta already has one
5. otherwise write a deterministic demo value shaped like
   `sample-customer-<hash>` to `profile.customerId`
   through the Okta Users API partial-update operation
6. update the current ACME auth-session metadata in Redis with that effective
   customer id when the session does not already have one
7. save the application-step summary with that effective customer id

The browser never receives Okta management credentials. The public Next ACA does
not receive Okta management credentials either; the private key is exposed only
to the internal BFF ACA as a Key Vault secret reference while sample mode is
enabled.

This Redis metadata update does not modify the signed Okta ID or access token.
The current application flow and BFF trusted-session headers can use the
effective `customerId` immediately; the raw Okta token claim appears after Okta
mints a new token through refresh or fresh sign-in.

Before enabling this path, create an Okta API Service app, register a signing
key, and grant the app the `okta.users.read okta.users.manage` scopes for the
org authorization server.

Scopes are necessary but not sufficient for Okta Management APIs. The service
app also needs an Okta admin role assignment. Prefer a least-privilege
`USER_ADMIN` role assignment targeted to `acme-los-customers-<env>` instead of
Super Admin. If the live dry-run returns Okta `E0000006`, the service app can
mint a token but still lacks the admin role or resource target required to read
and update the user.

Use the repo-managed role script for that admin-plane setup instead of a
portal-only change:

```powershell
node tools/scripts/okta/ensure-service-app-admin-role.mjs dev --token-file C:\secure\acme-los-okta-api-token.txt
node tools/scripts/okta/ensure-service-app-admin-role.mjs dev --token-file C:\secure\acme-los-okta-api-token.txt --confirm
```

The script defaults to dry-run, verifies that the target group is exactly
`acme-los-customers-<env>`, assigns only `USER_ADMIN`, and writes
`tmp/okta/<env>.service-app-role.outputs.json` without secrets.

Pre-deployment checklist for the sample bridge:

1. Create the Okta API Service app in the same Okta org that backs the target
   environment.
2. Register the service-app public key and keep the private key outside the
   repo, such as under `C:\Secured`.
3. Grant only `okta.users.read` and `okta.users.manage` on the service app's
   Okta API Scopes tab.
4. If the org requires admin roles for service apps, assign the narrowest
   admin role/resource set that can manage the app-owned `customerId` profile
   attribute and align `profile.login` with verified email for the target
   users.
5. Record the service-app `clientId` and signing key id (`kid`).
   Copy the `kid` exactly as Okta shows it, including any leading underscore.
6. Set `oktaCustomerIdWriteback.mode` to `sample` only after the service app,
   scope grant, client id, key id, and private key are ready.

Current `dev` enables the sample bridge, so first-time setup and key rotation
must provide a real `ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM` value before
deployment. The deploy script stores that value in Key Vault before the Bicep
runtime deployment by using an ARM/Bicep secret deployment that works with
private-only Key Vault networking; Bicep then wires the internal BFF env var to
a Key Vault secret reference. Later local redeploys can omit the env var and
reuse the existing Key Vault secret; the deploy script verifies that the secret
exists through ARM metadata before it continues. Keep the service app
identifiers in source control because they are not secret.

Current `dev` shape:

```json
"oktaCustomerIdWriteback": {
  "mode": "sample",
  "clientId": "<okta service app client id>",
  "privateKeyId": "<okta service app signing key id>",
  "scopes": "okta.users.read okta.users.manage"
},
"oktaAccountProfileSync": {
  "emailLoginSyncEnabled": true
}
```

in `infra/azure/config/platform.json`, then set the private key in the deploy
environment before the first local deploy or any key rotation:

```powershell
$oktaManagementPrivateKeyPath = 'C:\secure\acme bff management.pem'
$env:ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM = Get-Content -LiteralPath $oktaManagementPrivateKeyPath -Raw
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

For GitHub CD, set the same value as a `dev` environment secret named
`ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM`. The CD workflow only consumes the
secret; it does not run the GitHub environment bootstrap script during deploy.
Use the environment setup script to sync it from the local secured PEM file:

```powershell
$oktaManagementPrivateKeyPath = 'C:\secure\acme bff management.pem'
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/setup-github-azure-environments.ps1 `
  -Mode sync-environments `
  -SyncOktaManagementPrivateKeySecret `
  -OktaManagementPrivateKeyPemPath $oktaManagementPrivateKeyPath `
  -OktaManagementPrivateKeySecretEnvironments dev
```

The deploy stores the private key in Key Vault as
`sec-acme-los-okta-management-private-key` and injects it into the BFF ACA as
`ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM` while either
`oktaCustomerIdWriteback.mode` is `sample` or
`oktaAccountProfileSync.emailLoginSyncEnabled` is enabled. Keep sample
customer-id write-back out of higher environments until the real customer-id
issuer is finalized; the final production security shape remains BFF-owned
OAuth with the least Okta management scope required for the specific profile
attribute.

## Okta Policy Automation And Checks

The Okta bootstrap should keep ACME customer authentication policy scoped to the
environment customer group (`acme-los-customers-<env>`), not to Okta `Everyone`.
New self-service registrations should land in that customer group through the
profile-enrollment rule; admin users should not be added to it. Run
`npm run okta:policy-plan -- <env>` first, then run
`node tools/scripts/okta/bootstrap-okta.mjs <env> --dry-run` and review the
emitted `policyPlan` before applying live tenant changes.

After applying live tenant changes, run the read-only live audit:

```powershell
npm run okta:audit-live -- dev --token-file C:\secure\acme-los-okta-api-token.txt
```

The audit verifies the ACME customer group, app assignments, registration
target group, authenticator enrollment, 60-day global session rule, app access
rules, account-management rules, authorization claims, telephony hook state, and
recent SMS/inline-hook System Log evidence. It writes
`tmp/okta/<env>.live-okta-audit.json` with masked user identifiers.

Some Okta orgs return a read-only error when bootstrap tries to update the
profile-enrollment rule target-group condition. In that case bootstrap records a
`manual-required` result and fails closed with the exact Admin Console action.
Treat that error as a deployment gate: verify the registration rule targets only
`acme-los-customers-<env>` before relying on self-service registration. Do not
assign the ACME app to Okta `Everyone` as a workaround.

Scoping expectations:

| Surface                                                                                                        | Intended scope                | Notes                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile enrollment                                                                                             | `acme-los-customers-<env>`    | Bootstrap updates the Okta-managed registration rule to target the customer group and fails closed if that cannot be done.                                          |
| Authenticator enrollment                                                                                       | `acme-los-customers-<env>`    | Password, email, security-question, and phone/SMS enrollment are customer-policy scoped; `dev` requires phone/SMS through the mock provider.                        |
| Global session policy                                                                                          | `acme-los-customers-<env>`    | Bootstrap sets the 60-day maximum session lifetime and 120-minute idle timeout.                                                                                     |
| App sign-in policy                                                                                             | ACME web and mobile apps      | Bootstrap assigns the policy to the ACME OIDC apps and removes the app assignment from `Everyone` where possible.                                                   |
| Account-management lifecycle rules                                                                             | `acme-los-customers-<env>`    | Bootstrap manages password, email, and phone/SMS lifecycle rules through the public Policy API.                                                                     |
| Authorization server policy/rules                                                                              | ACME apps plus customer group | Token policy rules stay scoped to the app clients and customer group.                                                                                               |
| Authenticator activation, risk scoring, device assurance, device signal collection, hosted brand/custom domain | Okta org feature              | These cannot always be app-scoped directly. The repo scopes consumption through customer/app policies where Okta allows it, and documents any org-level dependency. |

The app-owned registration page renders Okta Identity Engine remediation, and
Okta may still require profile enrollment, password setup, email OTP,
security-question enrollment, and phone/SMS enrollment as separate steps.
The repo-managed profile-enrollment rule captures email as the login identifier,
first name, last name, and a Missouri/Texas State dropdown; the
authenticator-enrollment policy controls password, email verification, security
question, and phone/SMS enrollment. Phone is entered on the Okta phone/SMS
authenticator screen, where the customer explicitly requests the code; ACME does
not also collect profile phone in the profile-enrollment form. Password is an
Okta authenticator-enrollment input, not an ACME profile field.

If bootstrap reports `manual-required` for the profile-enrollment rule, do not
use a broader admin token or private Admin Console endpoint as a workaround.
Use Okta Admin to edit the default registration form fields and keep the target
group scoped to the ACME customer group.

### IDX State Model

The web app renders supported Identity Engine remediations on the ACME-owned
`/account/sign-in` surface with Auth JS. Auth JS sends identifiers, passwords,
security-question answers, and OTPs directly to Okta. The BFF generates and
stores PKCE verifier, state, nonce, expected subject, and step-up intent, then
redeems the one-time Interaction Code. OAuth tokens remain server-side.

The Gen3 hosted template under `tools/scripts/okta/templates` remains the mobile
redirect and rollback baseline. Run `npm run okta:audit-hosted-pages -- <env>`
after changing that template, but do not use hosted-page DOM customization to
implement web account actions.

`npm run okta:bootstrap -- <env>` manages only the recovery operations that the
Okta Account Management Policy supports:

- `ACME LOS Password Recovery (<env>)`: security question plus phone/SMS OTP,
  with documented email fallback where telephony is disabled.
- `ACME LOS Phone Recovery (<env>)`: security question plus email OTP for a lost
  phone factor.

Bootstrap deactivates the exact retired ACME password-change, email-recovery,
email-change, and phone-change rules. MyAccount Email, Phone, and Password APIs
are outside the Account Management Policy; the ACME BFF step-up and AMR checks
are authoritative for those signed-in mutations.

For a scoped Okta automation token, prefer `OKTA_MANAGEMENT_ACCESS_TOKEN` with
the Okta management scopes required by the bootstrap, including
`okta.policies.manage`. `OKTA_API_TOKEN` remains a local fallback for dev
bootstrap work.

After running the bootstrap, confirm in Okta Admin Console:

1. Go to `Security` > `Authenticators` > `Setup`.
1. Confirm `Security Question` is active for recovery and is not required in
   routine authentication or signed-in account changes.
1. Go to `Security` > `Authenticators` > `Enrollment`.
1. Confirm the ACME LOS enrollment policy requires password, email, security
   question, and phone/SMS only for the `acme-los-customers-<env>` customer
   group. In higher environments, phone/SMS should stay disabled until the real
   SMS sender/provider rollout is ready.
1. Confirm the profile-enrollment form requires email, first name, last name,
   and visible State for new registrations. The State field should be backed by
   `acmeState`, not Okta's built-in base `state` string, and should only offer
   Missouri and Texas. Phone is captured on the Okta phone/SMS authenticator
   enrollment screen instead.
1. Confirm the profile-enrollment registration rule targets only the
   `acme-los-customers-<env>` customer group, especially if bootstrap failed
   with a `manual-required` profile-enrollment gate.
1. Confirm phone/SMS factor enrollment is required in `dev` because
   `registrationRequiresPhoneVerification` is enabled and the mock telephony
   provider is active. For higher environments, keep it disabled until the real
   SMS sender/provider rollout is ready.
1. Go to the Okta account-management policy.
1. Confirm the ACME LOS account-management recovery rules exist, are scoped to the ACME
   customer group, and match the rendered `policyPlan` scenarios.
1. Confirm recovery flows require the expected opposite-channel OTP proof plus
   the Okta security-question challenge/hint.
1. Confirm dashboard change flows require fresh password reauthentication plus
   the opposite-channel OTP proof: email changes use phone/SMS OTP, phone/SMS
   changes use email OTP, and password changes use phone/SMS OTP.
   Confirm each sensitive change forces sign-off/fresh sign-in where the
   scenario requires it.
1. Confirm IDX passwords, security answers, and OTPs go directly to Okta.
   MyAccount password values may transit the TLS-protected BFF request but are
   never persisted or logged.
1. Confirm `customerId` remains an app-owned custom profile attribute and is
   not editable by end users.
1. Confirm admin users are not in the ACME LOS customer group unless they are
   intentionally being used as customer test accounts.
1. Go to `Security` > `Global Session Policy` and confirm the ACME LOS
   customer policy is scoped to `acme-los-customers-<env>`, has a 60-day
   maximum session lifetime, and has a 120-minute idle timeout.
1. Go to `Security` > `Authentication Policies` > `App sign-in` and confirm
   the ACME LOS app policy is assigned only to the ACME web and mobile apps.
1. Confirm the high-risk/new-device app rule requires password-first 2FA and
   does not require the security-question answer during sign-in.
1. If device assurance, device signal collection, Identity Threat Protection,
   or another device-risk feature is enabled in the org, confirm whether it is
   org-level only or consumed by the ACME app policy. Record any part that
   cannot be app-scoped.

## User Prune Allowlist

For demo/dev tenant hygiene, the repo includes a guarded user-prune command:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:prune-users -- dev --dry-run
```

Configure exact retained Okta logins in
`infra/okta/environments/<env>.json`:

```json
"userPrune": {
  "enabled": true,
  "action": "deactivate",
  "keepLogins": [
    "you@example.com",
    "vinod@example.com",
    "gopi@example.com"
  ],
  "keepProfileContains": ["vinod", "gopi"]
}
```

The script defaults to dry-run and writes
`tmp/okta/<env>.user-prune.outputs.json`. After checking the retained and
candidate users, run:

```powershell
npm run okta:prune-users -- dev --confirm-deactivate
```

Use `keepLogins` for exact login or email matches. Use `keepProfileContains`
only for short-lived demo tenant cleanup where matching on first name, last
name, display name, login, or email is acceptable.

The prune command also supports irreversible allowlist cleanup for deliberate
throwaway dev-account cleanup. Set `okta.userPrune.action` to `delete`, keep
`okta.userPrune.enabled` as `true`, inspect the dry-run report, and then run:

```powershell
npm run okta:prune-users -- dev --confirm-delete
```

Delete mode deactivates each non-allowlisted user first, waits for Okta to
report `DEPROVISIONED`, and then deletes as a second pass. It refuses admin-role
users and the API-token owner unless explicitly overridden.

Permanent deletion by exact login is also available for one-off cleanup:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:delete-users -- dev --login user@example.com --dry-run
npm run okta:delete-users -- dev --login user@example.com --confirm-delete
```

The delete command deactivates first, waits for `DEPROVISIONED`, then deletes.
It refuses admin-role users and the API-token owner unless explicitly
overridden. Okta deletion is unrecoverable.

## Dashboard UX

The ACME customer dashboard is read-only for customer identity/contact fields.
It sends customer account changes to ACME-branded account-security routes for:

- change password
- forgot password
- change sign-in email
- change phone/SMS factor

Password recovery and signed-in step-up use the ACME-owned Auth JS IDX page.
Identifiers, passwords, security answers, and OTPs go directly from Auth JS to
Okta. Signed-in password, email, and phone mutations use Okta's user-scoped
MyAccount API through the BFF with the active user's access token. The browser
calls ACME endpoints under `/api/account/security/*`; the Next facade checks
CSRF and the account-action step-up marker, then proxies to the BFF.

After Okta verifies a new primary email, the BFF aligns `profile.login` through
the OAuth service app only when email-login sync is enabled. That service
credential is Key Vault-backed and uses Okta OAuth scopes; the browser never
receives it. This server-side alignment complements the org-level `Map primary
email to login attribute` setting and is separate from the user-scoped
MyAccount mutation.
The read-only dashboard also uses the BFF to read verified phone/SMS enrollment
from Okta MyAccount; it does not call Okta from browser JavaScript.

The account-security routes have distinct step-up reasons:

- `/account/security/email` requires current password plus a fresh phone/SMS
  OTP before the form appears. Okta then sends exactly one final OTP to the new
  email when the customer clicks `Send email code`.
- `/account/security/phone` requires a fresh `account-phone` marker, which must
  be satisfied with current password plus email OTP before the form appears.
  Okta sends the final OTP to the new phone only after the customer clicks
  `Send SMS code`.
- `/account/security/password` requires a fresh `account-password` marker,
  which must be satisfied with current password plus phone/SMS OTP before the
  form appears. Security question is reserved for recovery. The BFF forwards
  the current password as `oldPassword` and the new password as `newPassword`
  directly to Okta MyAccount
  `POST /idp/myaccount/password/change-password`; it must not store or log
  either value.
- a successful mutation issues a short-lived signed, HttpOnly post-change
  intent. After Okta logout, the single `/account/sign-in` surface and
  `/api/auth/idx/start` endpoint recognize it and bind the new transaction to
  the same immutable Okta subject. Browser-supplied return paths and assurance
  values are ignored in this mode. Email change requires password plus
  new-email OTP; phone change requires password plus new-phone SMS OTP;
  password change requires the new password plus SMS OTP

The BFF account-security endpoints emit non-sensitive action-state logs for
`email.start`, `email.verify`, `phone.start`, `phone.verify`, and
`password.change`. Log entries include action, path, state/status, and whether
reauthentication is required. They must not include email addresses, phone
numbers, OTPs, current passwords, new passwords, security-question answers, or
authenticator secrets.

The custom authorization server must issue these scopes for the ACME web client:

- `okta.myAccount.email.read`
- `okta.myAccount.email.manage`
- `okta.myAccount.phone.read`
- `okta.myAccount.phone.manage`
- `okta.myAccount.password.read`
- `okta.myAccount.password.manage`

`npm run okta:bootstrap -- <env>` models those reserved scopes on the custom
authorization server before it updates the ACME app token rule.

After a password, email, or phone/SMS change, require a fresh ACME sign-in
before syncing confirmed metadata. ACME may transiently forward current/new
password values only for the signed-in MyAccount password-change call; it must
not store, log, sync, or reuse passwords, OTPs, security-question answers, or
authenticator secrets in dashboard forms or custom client-side widget scripting.

## Official References

- [Configure the security question authenticator](https://help.okta.com/oie/en-us/Content/Topics/identity-engine/authenticators/configure-security-question.htm)
- [Authenticators Administration API](https://developer.okta.com/docs/reference/api/authenticators-admin/)
- [Okta My Settings](https://help.okta.com/eu/en-us/content/topics/end-user/end-user-settings-v2.htm)
- [App sign-in policy rules](https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/add-app-sign-on-policy-rule.htm)
- [Risk scoring](https://help.okta.com/oie/en-us/content/topics/security/security_risk_scoring.htm)
- [Device signal collection policies](https://developer.okta.com/docs/guides/device-signal-collection-policies/main/)
- [Okta Event Hooks](https://developer.okta.com/docs/concepts/event-hooks/)
- [OAuth for Okta service apps](https://developer.okta.com/docs/guides/implement-oauth-for-okta-serviceapp/main/)
- [OAuth scopes for Okta Management APIs](https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/)
- [Configure user-scoped account management](https://developer.okta.com/docs/guides/configure-user-scoped-account-management/main/)
- [Okta Users API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/)

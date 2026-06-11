# Okta Account Security And Profile Sync

This runbook describes the customer account-security model for Okta-hosted
email, phone, password, and security-question changes.

Okta Integrator Admin org: <https://integrator-9373984.okta.com/>

## Security Model

Okta is the source of truth for identity and authentication. ACME backend
systems are the source of truth for customer and lending records.

- Okta `sub` is the immutable user key.
- Email is mutable contact and login metadata.
- Registration email is the customer login identifier in the hosted flow.
- Registration phone is captured as profile/contact metadata first; in `dev`,
  phone/SMS authenticator enrollment is also required through the mock telephony
  provider and becomes trusted only after Okta verifies the factor.
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

The intended Okta-hosted registration profile enrollment captures these required
fields:

- email: used as the login identifier
- first name
- last name
- phone number: captured on the Okta user profile, then verified as a required
  phone/SMS authenticator in `dev`
- state: supported state code captured on the Okta user profile as `acmeState`
  and rendered as a dropdown limited to Missouri and Texas

Password is not a profile-enrollment attribute. ACME configures password as
required Okta password-authenticator enrollment and records the profile
enrollment rule's password enrollment type when Okta exposes it. Okta owns
password entry, password requirements, confirm-password behavior when present,
and any password-policy messaging in the hosted flow.

Dev desired state: bootstrap creates/updates `acmeState` with only Missouri and
Texas enum values. The profile-enrollment rule and UI schema both use `email`,
`firstName`, `lastName`, `mobilePhone`, and `acmeState`; `acmeState` renders as
`select`, the rule targets
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
for dev, the current ACME customer-group users have already been verified with
matching `login` and `email` values.

The intended initial hosted-registration authenticator enrollment is:

- password: required
- email: required
- security question: required
- phone/SMS: required in `dev` through the mock telephony provider; the
  registration phone number remains profile/contact metadata until the customer
  verifies the Okta phone/SMS authenticator

The intended session and adaptive sign-in posture is:

- Customer global session policy: scoped to `acme-los-customers-<env>`, 60-day
  maximum session lifetime, 120-minute idle timeout, and keep-me-signed-in
  behavior from the environment manifest.
- App sign-in policy: assigned only to ACME LOS web and mobile OIDC apps.
- Standard app sign-in: password-first.
- High-risk or new-device sign-in: Okta risk score `HIGH` requires
  password-first 2FA, with keep-me-signed-in disabled for that event.
- Security question is not required during app sign-in. It is reserved for
  recovery and sensitive account-management changes.
- Device assurance and device signal collection are Okta org features. When
  the org supports them, ACME scopes their use through the app sign-in policy;
  if the org cannot support or accept those rules, the limitation must be
  recorded explicitly instead of broadening customer policy.

The intended sensitive-change and recovery scenarios are:

- Forgot email: require phone/SMS or another non-email possession-factor OTP
  plus the Okta security-question challenge/hint, then show the recovered
  sign-in email and require a fresh ACME sign-in.
- Change email: require phone/SMS or another non-email possession-factor OTP
  plus the Okta security-question challenge/hint before sign-off, then require
  sign-in with the new email.
- Forgot password: require the Okta security-question challenge/hint plus email
  OTP before reset, then sign out and require sign-in with the new password.
  The customer-scoped `ACME LOS Password Policy (<env>)` rule must allow
  self-service password reset with email as the primary recovery method and
  `accessControl=AUTH_POLICY`; the Okta Account Management policy then owns the
  security-question and OTP proof requirements.
- Change password: require current password, factor OTP, and the Okta
  security-question challenge/hint before reset, then sign out and require a
  fresh ACME sign-in.
- Lost phone/SMS factor: require email OTP plus the Okta security-question
  challenge/hint, then allow phone replacement and require a fresh ACME sign-in.
- Change phone/SMS: require email OTP plus the Okta security-question
  challenge/hint before sign-off, then require a fresh ACME sign-in.

## Backend Sync

Email sync is implemented on the customer-profile read path:

1. User changes email in Okta-hosted account settings.
2. User refreshes the ACME secure session through the normal Okta redirect.
3. ACME receives a new ID token for the same Okta `sub`.
4. The profile API compares the stored backend email with the current Okta
   email claim.
5. If the values differ, ACME updates the stored customer profile email and
   logs `customer.profile.email_changed`.

The log intentionally records the event and user context, not the old or new
email value.

Phone/SMS sync needs one of these sources before backend systems can update a
verified phone number:

- an Okta profile claim that contains the verified phone value
- a trusted Okta Management API lookup
- an Okta Event Hook that reports factor/profile changes

Until one is enabled, ACME can show and save an application servicing phone
number, but it must not claim that value is the verified Okta SMS factor.

No inbound Okta Event Hook is currently enabled for email, phone, password, or
security-question changes. The implemented email sync happens after a fresh ACME
session; passwords, OTPs, and security-question material never sync.

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
key, and grant the app the `okta.users.manage` scope for the org authorization
server.

Pre-deployment checklist for the sample bridge:

1. Create the Okta API Service app in the same Okta org that backs the target
   environment.
2. Register the service-app public key and keep the private key outside the
   repo, such as under `C:\Secured`.
3. Grant only `okta.users.manage` on the service app's Okta API Scopes tab.
4. If the org requires admin roles for service apps, assign the narrowest
   admin role/resource set that can manage the app-owned `customerId` profile
   attribute for the target users.
5. Record the service-app `clientId` and signing key id (`kid`).
   Copy the `kid` exactly as Okta shows it, including any leading underscore.
6. Set `oktaCustomerIdWriteback.mode` to `sample` only after the service app,
   scope grant, client id, key id, and private key are ready.

Current `dev` enables the sample bridge, so the GitHub `dev` environment must
have a real `ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM` value before deployment. Keep
the service app identifiers in source control because they are not secret.

Current `dev` shape:

```json
"oktaCustomerIdWriteback": {
  "mode": "sample",
  "clientId": "<okta service app client id>",
  "privateKeyId": "<okta service app signing key id>",
  "scopes": "okta.users.manage"
}
```

in `infra/azure/config/platform.json`, then set the private key in the deploy
environment before deploying locally:

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
`ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM` only while
`oktaCustomerIdWriteback.mode` is `sample`. Keep this sample bridge out of
higher environments until the real customer-id issuer is finalized; the final
production security shape remains BFF-owned OAuth with the least Okta
management scope required for the specific profile attribute.

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

| Surface                                                                                                        | Intended scope                | Notes                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile enrollment                                                                                             | `acme-los-customers-<env>`    | Bootstrap updates the Okta-managed registration rule to target the customer group and fails closed if that cannot be done.                                             |
| Authenticator enrollment                                                                                       | `acme-los-customers-<env>`    | Password, email, security-question, and phone/SMS enrollment are customer-policy scoped when telephony is enabled; `dev` requires phone/SMS through the mock provider. |
| Global session policy                                                                                          | `acme-los-customers-<env>`    | Bootstrap sets the 60-day maximum session lifetime and 120-minute idle timeout.                                                                                        |
| App sign-in policy                                                                                             | ACME web and mobile apps      | Bootstrap assigns the policy to the ACME OIDC apps and removes the app assignment from `Everyone` where possible.                                                      |
| Account-management lifecycle rules                                                                             | `acme-los-customers-<env>`    | Bootstrap manages password, email, and phone/SMS lifecycle rules through the public Policy API.                                                                        |
| Authorization server policy/rules                                                                              | ACME apps plus customer group | Token policy rules stay scoped to the app clients and customer group.                                                                                                  |
| Authenticator activation, risk scoring, device assurance, device signal collection, hosted brand/custom domain | Okta org feature              | These cannot always be app-scoped directly. The repo scopes consumption through customer/app policies where Okta allows it, and documents any org-level dependency.    |

Okta-hosted registration is one hosted flow, but Okta Identity Engine may still
render profile enrollment, password setup, email OTP, security-question
enrollment, and required phone/SMS enrollment in `dev` as separate hosted steps.
The repo-managed profile-enrollment rule captures email as the login identifier,
first name, last name, profile phone number, and a Missouri/Texas State
dropdown; the
authenticator-enrollment policy controls password, email verification, security
question, and phone/SMS enrollment. The app must not treat the profile
phone value as a verified SMS factor until the Okta phone/SMS authenticator is
verified. Password is an Okta authenticator-enrollment input, not an ACME
profile field; confirm/repeat-password display is Okta-hosted widget behavior
when available.

If bootstrap reports `manual-required` for the profile-enrollment rule, do not
use a broader admin token or private Admin Console endpoint as a workaround.
Use Okta Admin to edit the default registration form fields and keep the target
group scoped to the ACME customer group.

### Hosted Page State Model

ACME uses one Okta-hosted Sign-In Widget shell for customer auth. Registration,
forgot password, password reset, security question, email/SMS OTP, and factor
enrollment are Okta Identity Engine remediation states inside that hosted shell,
not separate ACME-owned pages. This keeps passwords, OTPs, security-question
answers, and authenticator enrollment inside Okta.

The hosted page template in `tools/scripts/okta/templates` is currently a
native Gen 3 baseline. Okta owns these remediation states and their controls;
ACME policy/bootstrap owns which states are available and how they are scoped:

| Okta state | Okta-owned flow                                                | ACME-owned responsibility                                      |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `signIn`   | Standard app sign-in                                           | App/client scoping, token claims, recovery/signup entry        |
| `signUp`   | Profile enrollment and registration                            | Required profile attributes, customer-group target, state enum |
| `enroll`   | Password, email, security-question, and phone/SMS enrollment   | Authenticator enrollment policy and provider readiness         |
| `verify`   | Email/SMS OTP, push, or other factor challenge                 | Factor policy, mock/real telephony, backend assurance handling |
| `recovery` | Forgot password, unlock, forgot email, or lost factor recovery | Account-management policy and opposite-factor intent           |
| `password` | Password reset or password setup                               | Password policy and post-change sign-in expectations           |

Run `npm run okta:audit-hosted-pages -- <env>` after changing the hosted page
template or controller. The current native-baseline audit renders sign-in,
signup, forgot-password, and unlock-account entry at mobile and desktop sizes,
writes screenshots to `tmp/okta-hosted-state-audit`, and fails on blank widget
renders, horizontal overflow, duplicate/missing recovery entry, or recovery
links pointed at dead hosted/help routes.

The app should link users into Okta-hosted account actions rather than building
local forms for these states. ACME may add CTAs and explanatory copy, but Okta
remains the form authority for registration, recovery, credentials, and factors.
The hosted page must not inject browser-only password, OTP, or authenticator
fields. Password policy owns requirements and lifecycle behavior, but it does
not control whether Okta-hosted Gen 3 registration renders a repeat/confirm
password control. If ACME needs that control as a hard product requirement, use
an embedded/custom IDX registration flow where ACME owns the full form and
server-side verification boundary.

`npm run okta:bootstrap -- <env>` manages three Okta account-management policy
rules through the public Policy API:

- `ACME LOS Password Lifecycle (<env>)`: forgot password and change password.
- `ACME LOS Email Lifecycle (<env>)`: forgot email and change email.
- `ACME LOS Phone Lifecycle (<env>)`: lost phone/SMS factor replacement and
  change phone; live in dev only when the mock or real SMS provider is enabled.

For a scoped Okta automation token, prefer `OKTA_MANAGEMENT_ACCESS_TOKEN` with
the Okta management scopes required by the bootstrap, including
`okta.policies.manage`. `OKTA_API_TOKEN` remains a local fallback for dev
bootstrap work.

After running the bootstrap, confirm in Okta Admin Console:

1. Go to `Security` > `Authenticators` > `Setup`.
2. Confirm `Security Question` is active and configured for authentication and
   recovery if the environment requires both.
3. Go to `Security` > `Authenticators` > `Enrollment`.
4. Confirm the ACME LOS enrollment policy requires password, email, security
   question, and phone/SMS only for the `acme-los-customers-<env>` customer
   group. In higher environments, phone/SMS should stay disabled until the real
   SMS sender/provider rollout is ready.
5. Confirm the profile-enrollment form requires email, first name, last name,
   phone number, and visible State for new registrations. The State field should
   be backed by `acmeState`, not Okta's built-in base `state` string, and should
   only offer Missouri and Texas.
6. Confirm the profile-enrollment registration rule targets only the
   `acme-los-customers-<env>` customer group, especially if bootstrap failed
   with a `manual-required` profile-enrollment gate.
7. Confirm phone/SMS factor enrollment is required in `dev` because
   `registrationRequiresPhoneVerification` is enabled and the mock telephony
   provider is active. For higher environments, keep it disabled until the real
   SMS sender/provider rollout is ready.
8. Go to the Okta account-management policy.
9. Confirm the three ACME LOS lifecycle rules exist, are scoped to the ACME
   customer group, and match the rendered `policyPlan` scenarios.
10. Confirm recovery/change flows require the expected OTP proof plus the Okta
    security-question challenge/hint and force sign-off/fresh sign-in where the
    scenario requires it.
11. Confirm password and security-question changes do not send secret material to
    ACME systems.
12. Confirm `customerId` remains an app-owned custom profile attribute and is
    not editable by end users.
13. Confirm admin users are not in the ACME LOS customer group unless they are
    intentionally being used as customer test accounts.
14. Go to `Security` > `Global Session Policy` and confirm the ACME LOS
    customer policy is scoped to `acme-los-customers-<env>`, has a 60-day
    maximum session lifetime, and has a 120-minute idle timeout.
15. Go to `Security` > `Authentication Policies` > `App sign-in` and confirm
    the ACME LOS app policy is assigned only to the ACME web and mobile apps.
16. Confirm the high-risk/new-device app rule requires password-first 2FA and
    does not require the security-question answer during sign-in.
17. If device assurance, device signal collection, Identity Threat Protection,
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
    "gopi@example.com",
    "sasha@example.com"
  ],
  "keepProfileContains": ["vinod", "gopi", "sasha"]
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

The ACME customer dashboard links users to the hosted account center for:

- login email
- phone/SMS factor
- password
- security question

After the user completes a hosted account change, they return to the dashboard
and refresh their secure session. The fresh session lets ACME sync confirmed
metadata without collecting secrets or OTPs in the app.

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
- [Okta Users API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/)

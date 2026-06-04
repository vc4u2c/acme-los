# Okta Account Security And Profile Sync

This runbook describes the customer account-security model for Okta-hosted
email, phone, password, and security-question changes.

Okta Integrator Admin org: <https://integrator-9373984.okta.com/>

## Security Model

Okta is the source of truth for identity and authentication. ACME backend
systems are the source of truth for customer and lending records.

- Okta `sub` is the immutable user key.
- Email is mutable contact and login metadata.
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

`tools/scripts/okta/bootstrap-okta.mjs` also emits the resolved `policyPlan` and
`accountSecurityPolicyIntent` during dry-run and live bootstrap.

The intended registration enrollment is:

- password: required
- email: required
- security question: required
- phone/SMS: optional until ACS toll-free verification is approved, then
  optional or required by environment rollout

The intended sensitive-change and recovery scenarios are:

- Forgot email: require an alternate possession-factor OTP plus the Okta
  security-question challenge/hint, then require a fresh ACME sign-in.
- Change email: require an other-factor OTP plus the Okta security-question
  challenge/hint before sign-off, then require sign-in with the new email.
- Forgot password: require the Okta security-question challenge/hint plus email
  OTP before reset, then sign out and require sign-in with the new password.
- Change password: require current password, factor OTP, and the Okta
  security-question challenge/hint before reset, then sign out and require a
  fresh ACME sign-in.
- Forgot phone: require email OTP plus the Okta security-question challenge/hint,
  then require a fresh ACME sign-in before phone replacement.
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
6. save the application-step summary with that effective customer id

The browser never receives Okta management credentials. The public Next ACA does
not receive Okta management credentials either; the private key is exposed only
to the internal BFF ACA as a Key Vault secret reference while sample mode is
enabled.

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
$env:ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM = Get-Content -LiteralPath 'C:\secured\acme bff management.pem' -Raw
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

For GitHub CD, set the same value as a `dev` environment secret named
`ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM`. The CD workflow only consumes the
secret; it does not run the GitHub environment bootstrap script during deploy.
Use the environment setup script to sync it from the local secured PEM file:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/setup-github-azure-environments.ps1 `
  -Mode sync-environments `
  -SyncOktaManagementPrivateKeySecret `
  -OktaManagementPrivateKeyPemPath 'C:\secured\acme bff management.pem' `
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
`npm run okta:bootstrap -- <env> --dry-run` and review the emitted `policyPlan`
before applying live tenant changes.

`npm run okta:bootstrap -- <env>` manages three Okta account-management policy
rules through the public Policy API:

- `ACME LOS Password Lifecycle (<env>)`: forgot password and change password.
- `ACME LOS Email Lifecycle (<env>)`: forgot email and change email.
- `ACME LOS Phone Lifecycle (<env>)`: forgot phone and change phone; harmless
  while phone/SMS remains disabled.

For a scoped Okta automation token, prefer `OKTA_MANAGEMENT_ACCESS_TOKEN` with
the Okta management scopes required by the bootstrap, including
`okta.policies.manage`. `OKTA_API_TOKEN` remains a local fallback for dev
bootstrap work.

After running the bootstrap, confirm in Okta Admin Console:

1. Go to `Security` > `Authenticators` > `Setup`.
2. Confirm `Security Question` is active and configured for authentication and
   recovery if the environment requires both.
3. Go to `Security` > `Authenticators` > `Enrollment`.
4. Confirm the ACME LOS enrollment policy requires password, email, and security
   question only for the `acme-los-customers-<env>` customer group.
5. Confirm phone/SMS enrollment matches the ACS rollout state.
6. Go to the Okta account-management policy.
7. Confirm the three ACME LOS lifecycle rules exist, are scoped to the ACME
   customer group, and match the rendered `policyPlan` scenarios.
8. Confirm recovery/change flows require the expected OTP proof plus the Okta
   security-question challenge/hint and force sign-off/fresh sign-in where the
   scenario requires it.
9. Confirm password and security-question changes do not send secret material to
   ACME systems.
10. Confirm `customerId` remains an app-owned custom profile attribute and is
    not editable by end users.
11. Confirm admin users are not in the ACME LOS customer group unless they are
    intentionally being used as customer test accounts.

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

Permanent deletion is a separate exact-login-only command for deliberate
throwaway dev-account cleanup:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:delete-users -- dev --login user@example.com --dry-run
npm run okta:delete-users -- dev --login user@example.com --confirm-delete
```

The delete command deactivates first, waits for `DEPROVISIONED`, then deletes.
It refuses admin-role users and the API-token owner unless explicitly
overridden. Okta deletion is unrecoverable, so keep this path out of broad
allowlist pruning.

## Dashboard UX

The ACME customer dashboard links users to Okta-hosted account settings for:

- login email
- phone/SMS factor
- password
- security question

After the user completes an Okta-hosted change, they return to the dashboard and
refresh their secure session. The fresh Okta session lets ACME sync confirmed
metadata without collecting secrets or OTPs in the app.

## Official References

- [Configure the security question authenticator](https://help.okta.com/oie/en-us/Content/Topics/identity-engine/authenticators/configure-security-question.htm)
- [Authenticators Administration API](https://developer.okta.com/docs/reference/api/authenticators-admin/)
- [Okta My Settings](https://help.okta.com/eu/en-us/content/topics/end-user/end-user-settings-v2.htm)
- [Okta Event Hooks](https://developer.okta.com/docs/concepts/event-hooks/)
- [OAuth for Okta service apps](https://developer.okta.com/docs/guides/implement-oauth-for-okta-serviceapp/main/)
- [OAuth scopes for Okta Management APIs](https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/)
- [Okta Users API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/)

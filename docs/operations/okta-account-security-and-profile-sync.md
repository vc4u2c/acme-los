# Okta Account Security And Profile Sync

This runbook describes the customer account-security model for Okta-hosted
email, phone, password, and security-question changes.

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

`tools/scripts/okta/bootstrap-okta.mjs` emits an
`accountSecurityPolicyIntent` block during dry-run and live bootstrap. That
block is the source-supported policy contract.

The intended registration enrollment is:

- password: required
- email: required
- security question: required
- phone/SMS: optional until ACS toll-free verification is approved, then
  optional or required by environment rollout

The intended sensitive-change rules are:

- Change email: require security question plus phone/SMS, then require a fresh
  ACME sign-in.
- Change phone/SMS: require security question plus email, then require a fresh
  ACME sign-in.
- Forgot password or change password: require a possession factor and the
  configured recovery checks; never sync password material.
- Forgot email or lost email access: use phone/SMS plus security question, then
  sync the recovered email after a fresh ACME sign-in.

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

## Manual Okta Admin Checks

After running `npm run okta:bootstrap -- <env>`, confirm in Okta Admin Console:

1. Go to `Security` > `Authenticators` > `Setup`.
2. Confirm `Security Question` is active and configured for authentication and
   recovery if the environment requires both.
3. Go to `Security` > `Authenticators` > `Enrollment`.
4. Confirm the ACME LOS enrollment policy requires password, email, and security
   question.
5. Confirm phone/SMS enrollment matches the ACS rollout state.
6. Go to the Okta account-management policy.
7. Confirm email changes require security question plus phone/SMS.
8. Confirm phone/SMS changes require security question plus email.
9. Confirm password and security-question changes do not send secret material to
   ACME systems.

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

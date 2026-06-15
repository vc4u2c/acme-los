# Okta SMS MFA With Azure Communication Services

This runbook activates Okta Phone Authenticator SMS delivery through Azure
Communication Services (ACS). The repo owns the repeatable infrastructure and
configuration path. Carrier verification remains an operator step.

## Current State

The source-supported real ACS path is staged until carrier verification is
approved. `dev` also has a mock provider for demo-only Okta Phone Authenticator
flows.

- Bicep provisions one ACS resource per workload environment.
- ACS local key authentication is disabled.
- The existing web ACA managed identity receives ACS-scoped `Contributor`
  access so the Next webhook can use Microsoft Entra authentication.
- `dev` has ACS resource `acs-acme-los-dev-cus-01`.
- `dev` has purchased toll-free sender `+18772244103`, recorded in
  `infra/azure/config/platform.json`.
- `dev` can set `smsMfa.provider` to `mock` and `okta.telephony.enabled` to
  `true` for the demo-only protected OTP inbox.
- `POST /api/hooks/okta/telephony` accepts Okta telephony inline-hook requests,
  validates a shared authorization header and bounded SMS payload, rate-limits
  requests, and either sends OTP messages through ACS or stores mock OTPs in the
  dev-only protected state store.
- the webhook does not log phone numbers or OTP codes in real ACS mode
- mock mode logs masked phone numbers only; OTP codes are read through the
  protected watcher

SMS should initially be an optional factor and recovery path. Keep a stronger
phishing-resistant authenticator available for sensitive production actions.

## What Is Automated

The repo automates:

- ACS resource creation through Bicep
- ACS local-key disablement
- managed-identity RBAC for the web ACA
- a guarded ACS Phone Numbers SDK command to list, search, and purchase a US
  toll-free number
- Key Vault storage and ACA secret reference for the hook authorization value
- Okta telephony inline-hook create, update, activate, and rollback
- Okta Phone Authenticator activation with SMS enabled and voice disabled
- authenticator enrollment-policy wiring

## What Remains Manual

Azure requires an operator to submit the US/Canada toll-free verification
application in the Azure portal. This step collects business identity, opt-in,
messaging use case, and sample-message details. Unverified toll-free numbers
cannot send SMS traffic to US or Canadian recipients.

Microsoft's current guidance says the full toll-free verification process
typically takes about five to six weeks. The portal status can take one to five
business days to move from submitted to pending, then four to five weeks to
reach a verdict. High application volume or unclear opt-in evidence can stretch
that timeline.

Use a paid Azure subscription with an eligible billing address. Trial
subscriptions and Azure free credits cannot purchase phone numbers.

Real ACS pre-deployment checkpoint:

- `dev` already has purchased toll-free sender `+18772244103`.
- Keep `infra/azure/config/platform.json` at `smsMfa.provider = mock` for
  demo-only phone-factor UI, or set `smsMfa.enabled = false` to disable phone.
- Keep `infra/okta/environments/dev.json` at `okta.telephony.enabled = false`
  if phone-factor UI is not needed.
- Keep `registrationRequiresPhoneVerification = false`.
- Submit the toll-free verification application now, but do not switch the
  provider to real ACS until Azure shows the number as verified.

## Twilio Trial Reality Check

Twilio can be useful for a narrow dev experiment, but it is not a dependable
replacement for ACS toll-free verification when the demo needs SMS to land on a
real US mobile phone.

Trial constraints to account for:

- Trial accounts can send SMS only to verified recipient phone numbers.
- The phone number used during Twilio signup is automatically verified, but each
  additional recipient must be verified with Twilio first.
- Twilio limits trial accounts to a small set of verified recipients and a daily
  message cap.
- For US/Canada toll-free senders, toll-free verification is still required for
  real mobile delivery.
- For US 10DLC/local senders, A2P 10DLC registration is required and requires a
  paid Twilio account.
- Trial accounts can use Twilio's Virtual Phone for a simulated SMS demo even
  when real mobile delivery is blocked.

Use this decision rule:

- If the demo only needs real authentication, keep Okta phone/SMS off and use
  email OTP plus security question.
- If the demo needs to show the phone-factor UI, use a dev-only mock telephony
  mode or Twilio Virtual Phone.
- If the demo must send to a real personal phone, try Twilio trial only after
  verifying that phone as a Twilio recipient, and expect it to be blocked if the
  assigned sender still needs toll-free verification or 10DLC registration.

Twilio trial smoke check:

1. Sign up for a Twilio trial account.
2. Verify the email address and personal phone number requested by Twilio.
3. In Twilio Console, choose the SMS Messaging trial or start building with
   Programmable Messaging.
4. Get the single trial phone number Twilio offers for the account.
5. Confirm the phone number type and SMS capability in Active Numbers.
6. Confirm the intended recipient phone is listed under Verified Caller IDs. The
   signup phone is usually verified automatically; add any other test phone
   explicitly.
7. Use Twilio's Try SMS flow first. Send only to the verified test phone or the
   Twilio Virtual Phone.
8. Record any error that mentions toll-free verification, A2P 10DLC, trial
   restrictions, template restrictions, or verified-recipient restrictions.
9. Do not wire Twilio into the Okta telephony hook unless the trial can deliver
   a programmable SMS to the intended test path. Okta OTP delivery needs dynamic
   message content, so a trial that only permits predefined templates is not
   enough for the real hook.

## Dev Mock SMS Demo

Use mock SMS only when a dev demo needs to show the Okta Phone Authenticator UI
but ACS toll-free verification or Twilio 10DLC/toll-free registration is still
blocked.

Mock mode does not send an SMS. Okta generates the OTP and sends it to the ACME
telephony hook. The hook validates the request, writes the OTP to the dev-only
protected state store, and returns Okta's success contract. The operator runs
the direct watcher, which reads the latest OTP from the protected inbox using
the same telephony hook authorization secret, then enters it on the Okta-hosted
page.

Because no carrier message is sent, mock mode is not subject to ACS, Twilio,
10DLC, toll-free, or Okta SMS-send quotas. The remaining limits are application
and Okta abuse-protection limits, including the ACME hook rate limit and Okta
factor-flow throttles.

Current dev mock shape:

```json
"smsMfa": {
  "enabled": true,
  "provider": "mock",
  "enableMockOtp": true
}
```

and:

```json
"telephony": {
  "enabled": true,
  "hookPath": "/api/hooks/okta/telephony"
}
```

Guardrails:

- mock mode is allowed only for `dev`
- `ACME_ENABLE_MOCK_SMS_OTP=true` must be explicit; the app accepts common
  boolean casing, and Bicep emits lowercase `true`/`false`
- OTPs are not written to container logs
- the direct mock OTP inbox requires `ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION`
- OTP inbox records expire with the Okta OTP window
- phone numbers are masked in the watcher output
- ACS/Twilio credentials are not needed for mock mode

Before deploying, create or reuse the Okta telephony hook authorization secret:

```powershell
npm run okta:sms-mfa:new-secret
$env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION='<Basic ...>'
```

Deploy dev so the web Container App receives the mock provider settings and the
hook authorization secret:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

Set `ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION` only for first-time setup or
rotation. The deploy script stores it in Key Vault before the Bicep runtime
deployment, and Bicep configures the Container App env var as a Key Vault secret
reference. Later redeploys verify and reuse the existing Key Vault secret
`sec-acme-los-okta-telephony-hook-authorization`.

Apply the Okta dev configuration after the deployment is live:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:bootstrap -- dev
```

Watch mock OTP records while testing. The watcher polls the protected dev
endpoint directly every 250 ms by default; it does not read Container App or Log
Analytics logs. It accepts the hook authorization through `-Authorization`,
`ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION`, or an authorization file. If no
authorization value is passed, it tries
`C:\secure\acme-los-okta-telephony-hook-authorization.txt`.

```powershell
npm run azure:okta-mock-sms:watch
```

Expected watcher output:

```text
[2026-06-04T19:42:11.000Z] Mock Okta SMS OTP
phone: +1******1234
otp: 482913
expires: 2026-06-04T19:47:11.000Z
transaction: mock-evt-123
```

Verify the live Okta side after bootstrap:

```powershell
npm run okta:audit-live -- dev --token-file C:\secure\acme-los-okta-api-token.txt
```

The audit should show the telephony inline hook as `ACTIVE`, the phone
authenticator with `sms=ACTIVE` and `voice=INACTIVE`, optional phone enrollment,
and no recent System Log SMS limit-exceeded entries. The audit output is written
to `tmp/okta/dev.live-okta-audit.json`.

If Okta shows `Unable to deliver the verification code` or an SMS-limit style
message during a mock demo, check these in order:

1. Live ACA environment has `ACME_OKTA_TELEPHONY_PROVIDER=mock`,
   `ACME_ENABLE_MOCK_SMS_OTP=true`, and `APP_ENVIRONMENT_NAME=dev`.
2. Okta System Log `inline_hook.response.processed` events should not have
   `outcome.result=FAILURE`.
3. Send a synthetic hook payload only with the configured hook authorization
   secret and a fake E.164 test number. A healthy mock path returns Okta's
   `com.okta.telephony.action` success command with a `mock-...` transaction id.
4. If the hook fails or times out, Okta can show delivery errors and may fall
   back to provider behavior that is subject to Okta or carrier send limits.

For real SMS, switch `provider` back to `acs`, keep `enableMockOtp` absent or
`false`, and enable only after the ACS sender number is verified.

## Dev Activation

### 1. Deploy ACS While SMS MFA Stays Disabled

Deploy `dev` normally. This creates or updates
`acs-acme-los-dev-cus-01` without exposing the hook secret to the runtime:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

### 2. Acquire A Toll-Free Number

List any existing ACS numbers first:

```powershell
npm run azure:sms-mfa:number -- list --environment dev
```

Purchase one only after reviewing the Azure charge:

```powershell
npm run azure:sms-mfa:number -- acquire --environment dev --confirm-purchase
```

The command reuses an existing outbound-SMS number when one is already
attached. Otherwise it searches for and purchases one US toll-free number.
`dev` currently uses `+18772244103`. Record any replacement number in
`smsMfa.senderPhoneNumber`, but keep `smsMfa.enabled` as `false` until
toll-free verification is approved.

### 3. Submit Toll-Free Verification

In the Azure portal:

1. Open `acs-acme-los-dev-cus-01`.
2. Open `Regulatory Documents` and select `Add`. If the portal shows the entry
   point under `Phone numbers`, select `+18772244103` and use
   `Submit Application`.
3. Choose the US/Canada toll-free verification application.
4. Select country or region and associated number `+18772244103`.
5. Complete company/contact details for the ACME LOS business owner.
6. Complete program details for transactional account-security OTP messages.
7. Upload opt-in evidence. For this flow, use screenshots showing the
   Okta-hosted phone/SMS factor enrollment or end-user settings path where the
   user chooses to receive a verification text.
8. Enter expected monthly volume for dev/test usage.
9. Add sample templates for every message type.
10. Review and submit.
11. Wait for Azure portal status to show the number is verified before enabling
    Okta SMS enrollment.

The form should accurately describe OTP sign-in or recovery messages, the user
opt-in path, expected volume, and support handling. Do not invent production
business details for the demo.

Suggested program description:

```text
ACME LOS sends transactional one-time passcodes to customers and applicants who
choose SMS as an Okta account-security factor for sign-in, account recovery, or
factor verification. Messages are sent only after the user starts an Okta
verification or enrollment flow. This is not a marketing program.
```

Suggested opt-in description:

```text
The user signs in to ACME LOS, opens Account Security, and is sent to the
Okta-hosted account settings experience. In Okta, the user chooses to enroll or
update the Phone/SMS security method, enters their phone number, and requests a
verification code. ACME sends SMS only for that user-initiated OTP flow.
```

Suggested sample SMS template:

```text
Your ACME verification code is 123456. Msg&data rates may apply. Reply HELP
for help or STOP to opt out.
```

Use the real ACME support contact/URL in the verification form. If the portal
requires a public opt-in URL, use a page that shows the Account Security path
and the SMS disclosure instead of a generic marketing or contact page.

### 4. Create The Shared Hook Secret

Generate one value:

```powershell
npm run okta:sms-mfa:new-secret
```

Store the emitted `Basic ...` value in your secret manager. Set it only in the
shell used for deploy and Okta bootstrap:

```powershell
$env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION='<Basic ...>'
```

Do not commit this value.

### 5. Enable The Dev Manifests

In `infra/azure/config/platform.json`, enable the staged sender:

```json
"smsMfa": {
  "enabled": true,
  "senderPhoneNumber": "+1..."
}
```

Keep `runtime.minReplicas` at `1` or higher for an SMS-enabled environment.
Okta telephony hooks have a short response window, so the deploy script blocks
an SMS configuration that could cold-start from zero replicas.

In `infra/okta/environments/dev.json`, set:

```json
"telephony": {
  "enabled": true,
  "hookPath": "/api/hooks/okta/telephony"
}
```

Leave `registrationRequiresPhoneVerification` as `false` for the first rollout
so SMS is optional. Change it to `true` only after the complete registration,
recovery, and support paths have been tested.

### 6. Deploy The Webhook And Apply Okta Configuration

Deploy the web runtime:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

Then apply Okta configuration with the same hook authorization value:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:bootstrap -- dev
```

The bootstrap creates or updates the org-level telephony inline hook, activates
Phone Authenticator, enables SMS, disables voice, and adds phone enrollment to
the ACME LOS authenticator policy.

Okta can fall back to its default telephony provider if the custom hook fails
or times out. Keep the webhook warm and monitor failure logs so fallback stays
exceptional rather than becoming the normal delivery path.

## Smoke Test

1. Confirm an unauthenticated webhook request returns `401`.
2. Register or sign in with a test customer.
3. Enroll the test phone number.
4. Request an SMS OTP.
5. In mock mode, copy the OTP from the direct protected inbox watcher at
   `tools/scripts/azure/watch-okta-mock-sms-otp.ps1` output and complete the
   Okta challenge.
6. In real ACS mode, confirm the code arrives on the phone and logs contain
   delivery event IDs and ACS transaction IDs but no phone numbers or OTP codes.
7. Confirm email MFA still works.

## Rollback

Set `okta.telephony.enabled` to `false` and run:

```powershell
$env:OKTA_API_TOKEN='<ssws token>'
npm run okta:bootstrap -- dev
```

The bootstrap deactivates the repo-managed telephony hook and phone
authenticator. Then set `smsMfa.enabled` to `false` and deploy the web runtime
again so the hook secret is removed from ACA configuration.

Keep the ACS resource and purchased number until the rollback decision is
final. Releasing a phone number is a billing and recovery-sensitive action.

## Official References

- [Okta telephony inline hook](https://developer.okta.com/docs/guides/telephony-inline-hook/-/main/)
- [Okta Phone Authenticator](https://help.okta.com/oie/en-us/content/topics/identity-engine/authenticators/configure-phone.htm)
- [ACS Phone Numbers quickstart](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/telephony/get-phone-number)
- [ACS apply for toll-free verification](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/sms/apply-for-toll-free-verification)
- [ACS toll-free verification](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/toll-free-verification-guidelines)
- [ACS SMS FAQ](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/sms-faq)
- [ACS Microsoft Entra authentication](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/identity/service-principal)
- [Twilio trial account](https://www.twilio.com/docs/usage/trials)
- [Twilio free trial limitations](https://help.twilio.com/hc/en-us/articles/360036052753-Twilio-Free-Trial-Limitations)
- [Twilio trial toll-free restrictions](https://help.twilio.com/articles/11853148778523-Trial-Limits-and-US-Toll-Free-Number-Restrictions)

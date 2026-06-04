# Okta SMS MFA With Azure Communication Services

This runbook activates Okta Phone Authenticator SMS delivery through Azure
Communication Services (ACS). The repo owns the repeatable infrastructure and
configuration path. Carrier verification remains an operator step.

## Current State

The source-supported path is staged but disabled by default:

- Bicep provisions one ACS resource per workload environment.
- ACS local key authentication is disabled.
- The existing web ACA managed identity receives ACS-scoped `Contributor`
  access so the Next webhook can use Microsoft Entra authentication.
- `dev` has ACS resource `acs-acme-los-dev-cus-01`.
- `dev` has purchased toll-free sender `+18772244103`, recorded in
  `infra/azure/config/platform.json`.
- `dev` keeps `smsMfa.enabled` and `okta.telephony.enabled` set to `false`
  until Microsoft approves toll-free verification.
- `POST /api/hooks/okta/telephony` accepts Okta telephony inline-hook requests,
  validates a shared authorization header and bounded SMS payload, rate-limits
  requests, and sends OTP messages through ACS.
- the webhook does not log phone numbers or OTP codes
- the Okta manifest keeps telephony disabled until the sender number is ready

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

Pre-deployment checkpoint:

- `dev` already has purchased toll-free sender `+18772244103`.
- Keep `infra/azure/config/platform.json` at `smsMfa.enabled = false`.
- Keep `infra/okta/environments/dev.json` at `okta.telephony.enabled = false`.
- Keep `registrationRequiresPhoneVerification = false`.
- Submit the toll-free verification application now, but do not enable the
  Okta phone factor or web hook secret until Azure shows the number as verified.

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
   Okta-hosted phone/SMS factor enrollment or account-settings path where the
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
5. Confirm the code arrives and completes the Okta challenge.
6. Confirm logs contain delivery event IDs and ACS transaction IDs but no
   phone numbers or OTP codes.
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

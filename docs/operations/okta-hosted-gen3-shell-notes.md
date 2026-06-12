# Okta Hosted Gen3 Shell Notes

The hosted sign-in page uses an ACME-styled shell around native Okta Gen3
controls. Okta still owns credentials, recovery, OTP, security-question, and
authenticator enrollment fields.

## Current Hosted Page Shape

- The hosted template renders the ACME brand header, auth context copy, support
  footer, theme toggle, Okta's standard background element,
  `#okta-login-container`, `{{{OktaUtil}}}`, and the Sign-In Widget resources.
- The controller uses `OktaUtil.getSignInWidgetConfig()` and calls
  `signIn.renderEl(...)` without `afterTransform`, custom labels, replacement
  controls, or internal Okta DOM rewrites.
- ACME left-rail shell copy is state-aware through Okta's supported
  `afterRender` context (`formName` and authenticator keys). The shell also
  honors ACME-owned `acme_widget_flow` URLs for forgot-password, unlock-account,
  and signup entry before the widget renders.
- ACME CSS styles the surrounding shell and applies scoped normalization to
  native Okta fields, buttons, links, focus rings, and footer actions. It must
  not inject or replace password, OTP, security-question, phone, or email
  controls.

## Functional Pass To Observe

- Sign in with email/password and confirm callback returns to the app.
- Create account through Okta's native registration link.
- Confirm registration shows the fields controlled by bootstrap:
  primary email, first name, last name, mobile phone, state, and password.
- Verify email using Okta's native email challenge behavior. If Okta starts in
  link-first mode, the code input appears only when the widget exposes its
  supported enter-code action; ACME styles that native state but does not inject
  custom OTP boxes.
- Verify phone/SMS using the configured Okta authenticator behavior.
- Set up the security question using Okta's native screen.
- Use native forgot-password recovery and confirm the configured policy path.
- Use native unlock-account recovery and confirm the configured policy path.
- Return to sign-in after recovery or sensitive account-management changes.

## Styling Notes To Capture Before Rework

- Native Gen3 form names seen in each flow.
- Native selectors/data attributes for registration, recovery, enrollment, and
  challenge screens.
- Native footer actions and whether forgot-password/unlock are already wired.
- Native MFA enrollment order and whether phone is required as expected.
- Native button/input dimensions at desktop and mobile sizes.
- Whether Chrome autofill or Okta/MUI field wrappers create border artifacts
  after the scoped ACME normalization layer.
- Any Okta-provided text that should remain unchanged for supportability.

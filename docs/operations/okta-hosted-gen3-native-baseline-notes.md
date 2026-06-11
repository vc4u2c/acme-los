# Okta Hosted Gen3 Native Baseline Notes

This checkpoint intentionally restores the hosted sign-in page to native Okta
Gen3 rendering so functionality can be verified before ACME visual styling is
reintroduced.

## Current Hosted Page Shape

- The hosted template renders only Okta's standard background element,
  `#okta-login-container`, `{{{OktaUtil}}}`, and the Sign-In Widget resources.
- The controller uses `OktaUtil.getSignInWidgetConfig()` and calls
  `signIn.renderEl(...)` without `afterTransform`, custom labels, ACME copy
  mutation, or replacement controls.
- The only ACME controller behavior is adding supported widget-flow URLs for
  forgot-password, unlock-account, and signup entry through the
  `acme_widget_flow` query parameter.
- There is no ACME sign-in stylesheet in this checkpoint. Okta native Gen3
  controls are intentionally left visible so functionality can be verified
  before a separate styling pass.

## Functional Pass To Observe

- Sign in with email/password and confirm callback returns to the app.
- Create account through Okta's native registration link.
- Confirm registration shows the fields controlled by bootstrap:
  primary email, first name, last name, mobile phone, state, and password.
- Verify email using Okta's native email challenge behavior.
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
  with native styling before any ACME CSS is reintroduced.
- Any Okta-provided text that should remain unchanged for supportability.

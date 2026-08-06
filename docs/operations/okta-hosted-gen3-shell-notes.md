# Okta Hosted Gen3 Shell Notes

The hosted sign-in page uses an ACME-styled shell around native Okta Gen3
controls. Okta still owns credentials, recovery, OTP, security-question, and
authenticator enrollment fields.

## Current Hosted Page Shape

- The hosted template renders the ACME brand header, auth context copy, support
  footer, theme toggle, Okta's standard background element,
  `#okta-login-container`, `{{{OktaUtil}}}`, and the Sign-In Widget resources.
- The hosted page is pinned through
  `okta.hostedExperience.signInWidgetVersion` in the environment manifest.
  Bootstrap writes that exact version to Okta, and the live audit fails if the
  tenant drifts back to a floating widget range.
- The controller uses `OktaUtil.getSignInWidgetConfig()`, registers supported
  Gen 3 `afterTransform('*')` form shaping for safe navigation links, and calls
  `signIn.renderEl(...)` without replacing credential, OTP, or authenticator
  controls.
- ACME left-rail shell copy is state-aware through Okta's supported
  `afterRender` context (`formName` and authenticator keys). The shell also
  honors ACME-owned `acme_widget_flow` URLs for forgot-password, unlock-account,
  and signup entry before the widget renders.
- Shell context updates happen in `afterRender`; widget form changes stay in
  `afterTransform`. The hosted page does not use a `MutationObserver` and never
  injects or replaces password, OTP, security-question, phone, or email
  controls.
- ACME CSS styles the surrounding shell and applies scoped normalization to
  native Okta fields, buttons, links, focus rings, and footer actions. It must
  not inject or replace password, OTP, security-question, phone, or email
  controls.

## Functional Pass To Observe

- Sign in with email/password and confirm callback returns to the app.
- Create account through Okta's native registration link.
- Confirm registration shows the fields controlled by bootstrap:
  primary email, first name, last name, state, and password.
- Verify required email authenticator enrollment. Profile submit should not
  auto-send a separate profile verification email. In Okta-hosted Gen3, choosing
  the native Email authenticator sends the email challenge; the hosted widget
  then offers the native email-code entry action. Do not inject an ACME-owned
  OTP textbox or fake a pre-send challenge page. If the business requirement is
  a custom pre-send textbox/button sequence, move that flow to embedded IDX in a
  separate branch.
- Verify required phone/SMS authenticator enrollment. The customer enters phone
  on the Okta phone authenticator screen and clicks the native receive-code
  action; the profile-enrollment form should not also ask for phone.
- Set up the security question using Okta's native screen.
- Use native forgot-password recovery and confirm the configured policy path.
- Use native unlock-account recovery and confirm the configured policy path.
- Open the ACME account-security email and phone routes from the dashboard and
  confirm they use hosted step-up first, then MyAccount verification.
- Return to sign-in after recovery or sensitive account-management changes.
- Trigger an Okta hosted timeout/error path and confirm every "back to sign in"
  or "home" action returns through `/api/auth/start` and the hosted Widget, not
  Okta UserHome.

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

## Official References

- [Customize Gen3 of the Sign-In Widget](https://developer.okta.com/docs/guides/custom-widget-gen3/main/)
- [Style the Okta-hosted Sign-In Widget](https://developer.okta.com/docs/guides/brand-and-customize/)
- [Okta-hosted Sign-In Widget customization example](https://github.com/oktadev/okta-js-siw-customization-example)

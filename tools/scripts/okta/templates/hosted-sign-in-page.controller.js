/*
 * Native Okta hosted Sign-In Widget baseline with supported recovery entry.
 *
 * ACME keeps credentials, recovery, OTPs, and enrollment inside Okta. The
 * optional acme_widget_flow query only selects a supported Sign-In Widget flow.
 */

const supportedWidgetFlows = new Set([
  'resetPassword',
  'unlockAccount',
  'signup',
]);

function buildWidgetFlowUrl(flowName) {
  const url = new URL(window.location.href);

  url.searchParams.set('acme_widget_flow', flowName);

  return url.toString();
}

function readRequestedWidgetFlow() {
  const requestedFlow = new URL(window.location.href).searchParams.get(
    'acme_widget_flow',
  );

  return requestedFlow && supportedWidgetFlows.has(requestedFlow)
    ? requestedFlow
    : undefined;
}

const widgetConfig = OktaUtil.getSignInWidgetConfig();
const requestedWidgetFlow = readRequestedWidgetFlow();
const existingCustomHelpLinks = Array.isArray(widgetConfig.helpLinks?.custom)
  ? widgetConfig.helpLinks.custom
  : [];

widgetConfig.helpLinks = {
  ...(widgetConfig.helpLinks || {}),
  forgotPassword: buildWidgetFlowUrl('resetPassword'),
  unlock: buildWidgetFlowUrl('unlockAccount'),
  custom: [
    {
      text: 'Forgot password?',
      href: buildWidgetFlowUrl('resetPassword'),
    },
    ...existingCustomHelpLinks.filter(
      (link) => !/forgot password/i.test(String(link?.text || '')),
    ),
  ],
};

if (requestedWidgetFlow) {
  widgetConfig.flow = requestedWidgetFlow;
}

const signIn = new OktaSignIn(widgetConfig);

signIn.renderEl(
  { el: '#okta-login-container' },
  OktaUtil.completeLogin,
  function onError(error) {
    console.log(error.message, error);
  },
);

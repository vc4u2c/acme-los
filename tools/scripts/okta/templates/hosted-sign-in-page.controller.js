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

function buildWidgetSignInUrl() {
  const url = new URL(window.location.href);

  url.searchParams.delete('acme_widget_flow');

  return url.toString();
}

function buildPrimaryCustomHelpLink(requestedFlow) {
  if (requestedFlow === 'resetPassword' || requestedFlow === 'unlockAccount') {
    return {
      text: 'Back to sign in',
      href: buildWidgetSignInUrl(),
    };
  }

  return {
    text: 'Forgot password?',
    href: buildWidgetFlowUrl('resetPassword'),
  };
}

function readRequestedWidgetFlow() {
  const requestedFlow = new URL(window.location.href).searchParams.get(
    'acme_widget_flow',
  );

  return requestedFlow && supportedWidgetFlows.has(requestedFlow)
    ? requestedFlow
    : undefined;
}

const authContextByState = {
  signIn: {
    eyebrow: 'Customer sign in',
    title: 'Continue your application',
    subtitle:
      'Resume your secure application, review disclosures, and check funding updates in one place.',
    trust:
      'Secure account access for application progress, disclosures, and funding updates.',
  },
  signup: {
    eyebrow: 'Create account',
    title: 'Start your secure profile',
    subtitle:
      'Create your ACME LOS account with your email, phone, state, and password before verification.',
    trust:
      'We use these details to protect your application access and prepare the verification steps.',
  },
  resetPassword: {
    eyebrow: 'Password recovery',
    title: 'Reset your password',
    subtitle:
      'Confirm your email, complete the required proof step, and sign in again with your new password.',
    trust:
      'Recovery keeps your application protected while restoring access to your account.',
  },
  unlockAccount: {
    eyebrow: 'Account unlock',
    title: 'Unlock your account',
    subtitle:
      'Verify your identity and regain access without changing your application details.',
    trust:
      'Unlocking may require your configured recovery proof before you return to sign in.',
  },
  accountProtection: {
    eyebrow: 'Account protection',
    title: 'Secure your account',
    subtitle:
      'Set up the required security methods so later sign-in and funding confirmation stay protected.',
    trust:
      'Email and security-question setup help protect sensitive account and application changes.',
  },
  emailVerification: {
    eyebrow: 'Email verification',
    title: 'Verify your email',
    subtitle:
      'Use the verification link or code sent to your email to continue securely.',
    trust:
      'Email verification confirms that account recovery and application notices reach you.',
  },
  phoneVerification: {
    eyebrow: 'Phone verification',
    title: 'Verify your phone',
    subtitle:
      'Confirm your mobile number with the one-time code before continuing.',
    trust:
      'Phone verification supports stronger proof for profile changes and funding actions.',
  },
};

const authStateByWidgetFlow = {
  resetPassword: 'resetPassword',
  signup: 'signup',
  unlockAccount: 'unlockAccount',
};

const authStateByFormName = {
  identify: 'signIn',
  'identify-recovery': 'resetPassword',
  'identify-recovery-verification': 'resetPassword',
  'reset-authenticator': 'resetPassword',
  'reset-authenticator-verification': 'resetPassword',
  'recover-authenticator': 'resetPassword',
  'unlock-account': 'unlockAccount',
  'unlock-account-verification': 'unlockAccount',
  'account-unlock': 'unlockAccount',
  'account-unlock-verification': 'unlockAccount',
  'enroll-profile': 'signup',
  'select-enroll-profile': 'signup',
  signup: 'signup',
  registration: 'signup',
  'select-authenticator-enroll': 'accountProtection',
  'enroll-authenticator': 'accountProtection',
  'enroll-authenticator-data': 'accountProtection',
  'enroll-authenticator-verification': 'accountProtection',
  'challenge-authenticator': 'accountProtection',
};

const authStateByAuthenticatorKey = {
  okta_email: 'emailVerification',
  email: 'emailVerification',
  phone_number: 'phoneVerification',
  phone: 'phoneVerification',
};

function setAuthContext(stateName) {
  const state = authContextByState[stateName] ? stateName : 'signIn';
  const copy = authContextByState[state];

  document.documentElement.setAttribute('data-acme-auth-state', state);

  for (const [slot, text] of Object.entries(copy)) {
    const element = document.querySelector(`[data-acme-auth-copy="${slot}"]`);

    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}

function resolveAuthStateFromRenderContext(context, requestedFlow) {
  const requestedFlowState = authStateByWidgetFlow[requestedFlow];
  const authenticatorKey =
    context?.authenticatorKey ||
    context?.authenticator?.key ||
    context?.authenticator?.type ||
    context?.currentAuthenticator?.key;

  if (authenticatorKey && authStateByAuthenticatorKey[authenticatorKey]) {
    return authStateByAuthenticatorKey[authenticatorKey];
  }

  const formName = context?.formName;

  if (requestedFlowState && (!formName || formName === 'identify')) {
    return requestedFlowState;
  }

  if (formName && authStateByFormName[formName]) {
    return authStateByFormName[formName];
  }

  return requestedFlowState || 'signIn';
}

const widgetConfig = OktaUtil.getSignInWidgetConfig();
const requestedWidgetFlow = readRequestedWidgetFlow();
const existingCustomHelpLinks = Array.isArray(widgetConfig.helpLinks?.custom)
  ? widgetConfig.helpLinks.custom
  : [];
const customHelpLinks = existingCustomHelpLinks.filter(
  (link) =>
    !/forgot password|back to sign in|help/i.test(String(link?.text || '')),
);

widgetConfig.helpLinks = {
  ...(widgetConfig.helpLinks || {}),
  forgotPassword: buildWidgetFlowUrl('resetPassword'),
  unlock: buildWidgetFlowUrl('unlockAccount'),
  custom: [buildPrimaryCustomHelpLink(requestedWidgetFlow), ...customHelpLinks],
};
delete widgetConfig.helpLinks.help;

if (requestedWidgetFlow) {
  widgetConfig.flow = requestedWidgetFlow;
}

setAuthContext(authStateByWidgetFlow[requestedWidgetFlow] || 'signIn');

const signIn = new OktaSignIn(widgetConfig);

signIn.on('afterRender', function onAfterRender(context) {
  setAuthContext(
    resolveAuthStateFromRenderContext(context, requestedWidgetFlow),
  );
});

signIn.renderEl(
  { el: '#okta-login-container' },
  function onSuccess(response) {
    OktaUtil.completeLogin(response);
  },
  function onError(error) {
    console.log(error.message, error);
  },
);

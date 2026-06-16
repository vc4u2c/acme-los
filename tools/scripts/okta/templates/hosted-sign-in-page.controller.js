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

const unsafeHostedLinkPattern =
  /\/app\/UserHome|\/enduser\/|\/userhome|\/signin\/(?:forgot-password|unlock)(?:\/|$)|\/help\/login/i;

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

function readCssVariable(name, fallbackValue) {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallbackValue;
}

function applyWidgetThemeTokens(config) {
  config.theme = {
    ...(config.theme || {}),
    tokens: {
      ...(config.theme?.tokens || {}),
      BorderColorDisplay: readCssVariable('--acme-border', '#cbd8ce'),
      BorderColorPrimaryControl: readCssVariable('--acme-focus', '#116243'),
      BorderRadiusMain: '6px',
      BorderRadiusTight: '4px',
      BorderWidthMain: '1px',
      FocusOutlineColorPrimary: readCssVariable('--acme-focus', '#116243'),
      FocusOutlineOffsetMain: '2px',
      FocusOutlineWidthMain: '2px',
      HueNeutralWhite: readCssVariable('--acme-card', '#fffdf8'),
      HueNeutral50: readCssVariable('--acme-surface', '#f4f6f1'),
      HueNeutral100: readCssVariable('--acme-surface-strong', '#e8eee7'),
      HueNeutral200: readCssVariable('--acme-border', '#cbd8ce'),
      HueNeutral300: readCssVariable('--acme-border-strong', '#9fb1a4'),
      HueNeutral700: readCssVariable('--acme-muted-text', '#52625a'),
      HueNeutral900: readCssVariable('--acme-text', '#17211d'),
      PalettePrimaryMain: readCssVariable('--acme-brand', '#116243'),
      PalettePrimaryText: readCssVariable('--acme-link', '#116243'),
      PalettePrimaryDark: readCssVariable('--acme-brand-strong', '#0d5338'),
      Spacing3: '0.55rem',
      Spacing4: '0.75rem',
      Spacing5: '1rem',
      TypographyColorAction: readCssVariable('--acme-link', '#116243'),
      TypographyColorBody: readCssVariable('--acme-text', '#17211d'),
      TypographyColorHeading: readCssVariable('--acme-text', '#17211d'),
      TypographyColorInverse: readCssVariable(
        '--acme-brand-contrast',
        '#ffffff',
      ),
      TypographyColorSupport: readCssVariable('--acme-muted-text', '#52625a'),
      TypographyFamilyBody: readCssVariable(
        '--acme-font-body',
        "Aptos, 'Segoe UI Variable Display', 'Segoe UI', sans-serif",
      ),
      TypographyFamilyHeading: readCssVariable(
        '--acme-font-display',
        "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
      ),
      TypographyWeightHeading: 650,
    },
  };
}

function applyWidgetCopyOverrides(config) {
  config.i18n = {
    ...(config.i18n || {}),
    en: {
      ...(config.i18n?.en || {}),
      'oie.select.authenticators.enroll.title': 'Protect your account',
      'oie.select.authenticators.enroll.subtitle':
        "Choose the verification methods we'll use to confirm it's you during sign-in and sensitive account changes.",
      'oie.setup.required.now': 'Required to continue',
      'oie.phone.authenticator.description':
        'Verify with a code sent to your US mobile phone',
      'oie.phone.enroll.title': 'Verify your US mobile phone',
      'oie.phone.enroll.subtitle':
        'Use a US mobile number that can receive text messages.',
    },
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
  },
  signup: {
    eyebrow: 'Create account',
    title: 'Start your secure profile',
    subtitle:
      'Create your ACME LOS account with your email, phone, state, and password before verification.',
  },
  resetPassword: {
    eyebrow: 'Password recovery',
    title: 'Reset your password',
    subtitle:
      'Confirm your email, complete the required proof step, and sign in again with your new password.',
  },
  unlockAccount: {
    eyebrow: 'Account unlock',
    title: 'Unlock your account',
    subtitle:
      'Verify your identity and regain access without changing your application details.',
  },
  accountProtection: {
    eyebrow: 'Account protection',
    title: 'Protect your account',
    subtitle:
      "Choose the verification methods we'll use to confirm it's you during sign-in and sensitive account changes.",
  },
  emailVerification: {
    eyebrow: 'Email verification',
    title: 'Verify your email',
    subtitle:
      'Use the verification link or code sent to your email to continue securely.',
  },
  phoneVerification: {
    eyebrow: 'Phone verification',
    title: 'Verify your phone',
    subtitle:
      'Confirm your mobile number with the one-time code before continuing.',
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

const signInLinkTexts = new Set([
  'sign in',
  'sign on',
  'back to sign in',
  'back to sign on',
  'go back to sign in',
  'go back to sign on',
  'return to sign in',
  'return to sign on',
  'go to sign in',
  'go to sign on',
  'continue to sign in',
  'continue to sign on',
  'go to homepage',
  'go to home page',
  'log in',
  'login',
  'back to log in',
  'back to login',
  'go back to log in',
  'go back to login',
  'return to log in',
  'return to login',
  'continue to log in',
  'continue to login',
]);

function normalizeActionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.?!]+$/g, '');
}

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

function setShellLinks() {
  document
    .querySelectorAll('[data-acme-auth-sign-in-link]')
    .forEach((element) => {
      wireSignInLink(element);
    });
}

function wireSignInLink(element) {
  const signInUrl = buildWidgetSignInUrl();

  if (
    element.tagName?.toLowerCase() === 'a' ||
    element.hasAttribute?.('href')
  ) {
    if (element.getAttribute('href') !== signInUrl) {
      element.setAttribute('href', signInUrl);
    }
  }

  if (element.getAttribute('data-acme-auth-sign-in-target') !== signInUrl) {
    element.setAttribute('data-acme-auth-sign-in-target', signInUrl);
  }

  if (element.getAttribute('data-acme-auth-sign-in-bound') === 'true') {
    return;
  }

  element.setAttribute('data-acme-auth-sign-in-bound', 'true');
  element.addEventListener('click', function routeToSignIn(event) {
    event.preventDefault();
    window.location.assign(buildWidgetSignInUrl());
  });
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

function readFormElementText(element) {
  return normalizeActionText(
    element?.label ||
      element?.options?.label ||
      element?.options?.text ||
      element?.options?.content ||
      element?.content,
  );
}

function readFormElementHref(element) {
  return String(element?.options?.href || element?.href || '');
}

function setFormElementHref(element, href) {
  element.options = {
    ...(element.options || {}),
    href,
  };

  if (Object.prototype.hasOwnProperty.call(element, 'href')) {
    element.href = href;
  }
}

function isNativeHelpElement(element) {
  return (
    element?.type === 'Link' &&
    (element?.options?.dataSe === 'help' ||
      (readFormElementText(element) === 'help' &&
        unsafeHostedLinkPattern.test(readFormElementHref(element))))
  );
}

function isWidgetSignInReturnElement(element) {
  const text = readFormElementText(element);
  const href = readFormElementHref(element);
  const dataSe = String(element?.options?.dataSe || '');

  return (
    dataSe === 'sign-in' ||
    dataSe === 'sign-on' ||
    dataSe === 'delayed-sign-on' ||
    signInLinkTexts.has(text) ||
    (unsafeHostedLinkPattern.test(href) && /\b(?:sign|log|home)\b/i.test(text))
  );
}

function transformFormElements(elements, signInUrl) {
  if (!Array.isArray(elements)) {
    return elements;
  }

  return elements
    .filter((element) => !isNativeHelpElement(element))
    .map((element) => {
      if (isWidgetSignInReturnElement(element)) {
        setFormElementHref(element, signInUrl);
      }

      if (Array.isArray(element?.elements)) {
        element.elements = transformFormElements(element.elements, signInUrl);
      }

      if (Array.isArray(element?.options?.elements)) {
        element.options = {
          ...(element.options || {}),
          elements: transformFormElements(element.options.elements, signInUrl),
        };
      }

      return element;
    });
}

function registerWidgetTransforms(oktaSignIn) {
  if (typeof oktaSignIn.afterTransform !== 'function') {
    return;
  }

  oktaSignIn.afterTransform('*', function transformWidgetForm({ formBag }) {
    const elements = formBag?.uischema?.elements;

    if (Array.isArray(elements)) {
      formBag.uischema.elements = transformFormElements(
        elements,
        buildWidgetSignInUrl(),
      );
    }
  });
}

const widgetConfig = OktaUtil.getSignInWidgetConfig();
const requestedWidgetFlow = readRequestedWidgetFlow();
const existingCustomHelpLinks = Array.isArray(widgetConfig.helpLinks?.custom)
  ? widgetConfig.helpLinks.custom
  : [];
const customHelpLinks = existingCustomHelpLinks.filter((link) => {
  const text = normalizeActionText(link?.text);
  const href = String(link?.href || '');

  return (
    !/forgot password|help/i.test(text) &&
    !signInLinkTexts.has(text) &&
    !unsafeHostedLinkPattern.test(href)
  );
});

widgetConfig.helpLinks = {
  ...(widgetConfig.helpLinks || {}),
  forgotPassword: buildWidgetFlowUrl('resetPassword'),
  unlock: buildWidgetFlowUrl('unlockAccount'),
  custom: [buildPrimaryCustomHelpLink(requestedWidgetFlow), ...customHelpLinks],
};
delete widgetConfig.helpLinks.help;
applyWidgetThemeTokens(widgetConfig);
applyWidgetCopyOverrides(widgetConfig);

if (requestedWidgetFlow) {
  widgetConfig.flow = requestedWidgetFlow;
}

setShellLinks();
setAuthContext(authStateByWidgetFlow[requestedWidgetFlow] || 'signIn');

// Okta's hosted wrapper probes this exact global variable name after our script.
const oktaSignIn = new OktaSignIn(widgetConfig);
registerWidgetTransforms(oktaSignIn);

oktaSignIn.on('afterRender', function onAfterRender(context) {
  setAuthContext(
    resolveAuthStateFromRenderContext(context, requestedWidgetFlow),
  );
  setShellLinks();
});

oktaSignIn.renderEl(
  { el: '#okta-login-container' },
  function onSuccess(response) {
    OktaUtil.completeLogin(response);
  },
  function onError() {
    if (window.console && typeof window.console.warn === 'function') {
      window.console.warn('Unable to render secure sign-in widget.');
    }
  },
);

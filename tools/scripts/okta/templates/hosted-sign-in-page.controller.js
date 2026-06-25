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
const signInReturnText = 'Sign in';
const verificationMethodReturnText = 'Choose another verification method';

function buildWidgetFlowUrl(flowName) {
  const url = new URL(window.location.href);

  url.searchParams.set('acme_widget_flow', flowName);

  return url.toString();
}

function readConfiguredSignInStartUrl() {
  const configuredUrl = document
    .querySelector('meta[name="acme-sign-in-start-url"]')
    ?.getAttribute('content')
    ?.trim();

  if (!configuredUrl) {
    return '';
  }

  try {
    return new URL(configuredUrl).toString();
  } catch {
    return '';
  }
}

function buildWidgetSignInUrl() {
  const configuredSignInStartUrl = readConfiguredSignInStartUrl();

  if (configuredSignInStartUrl) {
    return configuredSignInStartUrl;
  }

  const url = new URL(window.location.href);

  for (const key of Array.from(url.searchParams.keys())) {
    if (key.startsWith('acme_')) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}

function buildPrimaryCustomHelpLink(requestedFlow) {
  if (requestedFlow === 'resetPassword' || requestedFlow === 'unlockAccount') {
    return {
      text: signInReturnText,
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
      BorderColorDisplay: '#cbd8ce',
      BorderColorDisabled: '#d9e2dc',
      BorderColorDangerLight: '#d9a39c',
      BorderColorDangerControl: '#b24a3d',
      BorderColorDangerDark: '#8f352b',
      BorderColorPrimaryControl: '#116243',
      BorderColorPrimaryDark: '#0d5338',
      BorderRadiusMain: '6px',
      BorderRadiusTight: '4px',
      BorderStyleMain: 'solid',
      BorderWidthMain: '1px',
      FocusOutlineColorPrimary: '#116243',
      FocusOutlineOffsetMain: '2px',
      FocusOutlineOffsetTight: '0',
      FocusOutlineStyle: 'solid',
      FocusOutlineWidthMain: '2px',
      FocusOutlineWidthTight: '1px',
      HueNeutralWhite: '#fffdf8',
      HueNeutral50: '#f4f6f1',
      HueNeutral100: '#e8eee7',
      HueNeutral200: '#cbd8ce',
      HueNeutral300: '#9fb1a4',
      HueNeutral400: '#7b8d82',
      HueNeutral500: '#64766d',
      HueNeutral600: '#52625a',
      HueNeutral700: '#3c4a43',
      HueNeutral800: '#28332e',
      HueNeutral900: '#17211d',
      PaletteDangerLighter: '#fff3ee',
      PaletteDangerLight: '#d9a39c',
      PaletteDangerMain: '#b24a3d',
      PaletteDangerDark: '#8f352b',
      PaletteDangerDarker: '#622219',
      PaletteDangerText: '#8f352b',
      PaletteDangerHeading: '#622219',
      PaletteDangerHighlight: '#f6d6cf',
      PalettePrimaryLighter: '#edf6ef',
      PalettePrimaryLight: '#6fb38d',
      PalettePrimaryMain: '#116243',
      PalettePrimaryDark: '#0d5338',
      PalettePrimaryDarker: '#083824',
      PalettePrimaryText: '#0d5338',
      PalettePrimaryHeading: '#083824',
      PalettePrimaryHighlight: '#d9efe2',
      PaletteSuccessLighter: '#edf6ef',
      PaletteSuccessLight: '#6fb38d',
      PaletteSuccessMain: '#116243',
      PaletteSuccessDark: '#0d5338',
      PaletteSuccessDarker: '#083824',
      PaletteSuccessText: '#0d5338',
      PaletteSuccessHeading: '#083824',
      PaletteSuccessHighlight: '#d9efe2',
      PaletteWarningLighter: '#fff7d8',
      PaletteWarningLight: '#d4a64b',
      PaletteWarningMain: '#966603',
      PaletteWarningDark: '#664402',
      PaletteWarningDarker: '#352401',
      PaletteWarningText: '#664402',
      PaletteWarningHeading: '#352401',
      PaletteWarningHighlight: '#f8e7bc',
      Spacing3: '0.55rem',
      Spacing4: '0.75rem',
      Spacing5: '1rem',
      TypographyColorAction: '#0d5338',
      TypographyColorBody: '#17211d',
      TypographyColorDanger: '#8f352b',
      TypographyColorDisabled: '#7b8d82',
      TypographyColorHeading: '#17211d',
      TypographyColorInverse: '#ffffff',
      TypographyColorSubordinate: '#64766d',
      TypographyColorSuccess: '#0d5338',
      TypographyColorSupport: '#52625a',
      TypographyColorWarning: '#664402',
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
      'enroll.choices.title': 'Protect your account',
      'enroll.choices.description':
        "Choose the verification methods we'll use to confirm it's you.",
      'enroll.choices.description.generic':
        "Choose the verification methods we'll use to confirm it's you.",
      'enroll.choices.list.setup': 'Required to continue',
      'enroll.choices.setup': 'Set up',
      'enroll.choices.setup.another': 'Set up another verification method',
      'enroll.choices.submit.configure': 'Continue',
      'enroll.choices.submit.next': 'Continue',
      'oie.email.authenticator.description':
        'Verify with a code sent to your email',
      'oie.email.enroll.title': 'Verify your email',
      'oie.email.enroll.subtitle':
        'Use the code sent to your email when email verification is required.',
      'oie.email.challenge.title': 'Enter your email verification code',
      'factor.email': 'Email',
      'factor.email.description':
        'Enter the verification code sent to your email.',
      'email.button.send': 'Send email code',
      'email.button.resend': 'Send another email code',
      'email.code.label': 'Email verification code',
      'email.code.not.received': 'Need another email code?',
      'email.enroll.title': 'Verify your email',
      'email.enroll.description': 'Send a verification code to your email.',
      'email.enroll.enterCode': 'Enter code',
      'email.mfa.title': 'Verify with email',
      'email.mfa.description': 'Send a verification code to {0}.',
      'email.mfa.email.sent.description':
        'A verification code was sent to {0}. Enter the code below.',
      'email.mfa.email.sent.description.sentText':
        'A verification code was sent to',
      'email.mfa.email.sent.description.emailCodeText': 'Enter the code below.',
      'mfa.sendEmail': 'Send email code',
      'mfa.resendEmail': 'Send another email',
      'mfa.emailVerification.title': 'Sign in with email',
      'mfa.emailVerification.subtitle': 'Email will be sent to {0}.',
      'mfa.emailVerification.otc.finish': 'Enter the code sent to your email.',
      'password.forgot.email.or.username.placeholder': 'Email',
      'password.forgot.email.or.username.tooltip': 'Email',
      'password.forgot.sendEmail': 'Send recovery email',
      'password.forgot.emailSent.title': 'Check your email',
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
      'Create your ACME LOS account with your email, state, and password, then verify email and phone.',
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
  'secure sign in',
  'back to sign in',
  'back to sign on',
  'back to secure sign in',
  'go back to sign in',
  'go back to sign on',
  'go back to secure sign in',
  'return to sign in',
  'return to sign on',
  'return to secure sign in',
  'go to sign in',
  'go to sign on',
  'go to secure sign in',
  'continue to sign in',
  'continue to sign on',
  'continue to secure sign in',
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

const authenticatorReturnLinkTexts = new Set([
  'back to authenticator',
  'back to authenticators',
  'go back to authenticator',
  'go back to authenticators',
  'return to authenticator',
  'return to authenticators',
  'choose another authenticator',
  'select another authenticator',
  'choose a different authenticator',
  'select a different authenticator',
]);

const friendlyWidgetTextByNormalizedText = new Map([
  ['set up email authentication', 'Verify your email'],
  ['setup email authentication', 'Verify your email'],
  ['setup required', 'Required to continue'],
  ['set up another', 'Set up another verification method'],
  ['setup another', 'Set up another verification method'],
  ['configure factor', 'Continue'],
  ['configure next factor', 'Continue'],
  ['send me the code', 'Send email code'],
  ['send again', 'Send another email code'],
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

  if ((element.textContent || '').trim() !== signInReturnText) {
    element.textContent = signInReturnText;
  }

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

function setFormElementText(element, text) {
  element.label = text;
  element.options = {
    ...(element.options || {}),
    label: text,
    text,
    content: text,
  };

  if (Object.prototype.hasOwnProperty.call(element, 'content')) {
    element.content = text;
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

function isAuthenticatorReturnElement(element) {
  if (element?.type !== 'Link') {
    return false;
  }

  const text = readFormElementText(element);

  return (
    authenticatorReturnLinkTexts.has(text) || /\bauthenticator\b/i.test(text)
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
        setFormElementText(element, signInReturnText);
      } else if (isAuthenticatorReturnElement(element)) {
        setFormElementText(element, verificationMethodReturnText);
      } else {
        const friendlyText = friendlyWidgetTextByNormalizedText.get(
          readFormElementText(element),
        );

        if (friendlyText) {
          setFormElementText(element, friendlyText);
        }
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildHostedSignInPageContent } from './hosted-sign-in-page.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const environmentName = process.argv[2] ?? 'dev';
const outputDirectory = path.join(repoRoot, 'tmp', 'okta-hosted-state-audit');

const states = [
  {
    key: 'signIn',
    widget: buildSignInFixture(),
    expectedTexts: [
      'Continue your application',
      'Use the same secure account',
      'Username',
      'This field cannot be left blank',
      'Forgot password?',
      'Do not have an account?',
      'Sign up',
    ],
  },
  {
    key: 'signUp',
    widget: buildSignUpFixture(),
    expectedTexts: [
      'Create your customer account',
      'Registration includes contact verification',
      'First name',
      'Primary email',
      'Phone number',
      'State',
      'Repeat password',
      'Password requirements',
      'Already have an account?',
      'Sign in',
    ],
  },
  {
    key: 'enroll',
    widget: buildEnrollFixture(),
    expectedTexts: [
      'Set up security method',
      'Password',
      'Email',
      'Security Question',
      'Phone',
    ],
  },
  {
    key: 'verify',
    widget: buildVerifyFixture(),
    expectedTexts: [
      'Enter code',
      'We only ask for the next proof step',
      'vc4u2c+7@gmail.com',
      'Verification code',
    ],
  },
  {
    key: 'emailLink',
    expectedAuthState: 'verify',
    widget: buildEmailLinkFixture(),
    expectedTexts: [
      'Verify your identity',
      'We sent an email',
      'Enter code',
      'Verify',
    ],
  },
  {
    key: 'securityQuestion',
    expectedAuthState: 'enroll',
    widget: buildSecurityQuestionFixture(),
    expectedTexts: [
      'Set up security question',
      'Choose a security question',
      'Create my own security question',
      'Answer',
    ],
  },
  {
    key: 'recovery',
    widget: buildRecoveryFixture(),
    expectedTexts: [
      'Forgot password',
      'Recovery checks help protect the account',
      'Reset your password',
      'Enter the email used for this application',
    ],
  },
  {
    key: 'password',
    widget: buildPasswordFixture(),
    expectedTexts: [
      'Reset password',
      'Use a password you do not reuse anywhere else',
      'New password',
      'Repeat password',
      'Reset your password',
      'Enter the email used for this application',
    ],
  },
];

const themes = ['light', 'dark'];
const viewports = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 960, height: 900 },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const branding = loadHostedBranding(environmentName);
  const hostedPageContent = toAuditHtml(
    buildHostedSignInPageContent(branding),
    Object.fromEntries(states.map((state) => [state.key, state.widget])),
  );

  fs.mkdirSync(outputDirectory, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        for (const state of states) {
          const page = await browser.newPage({ viewport });
          try {
            results.push(
              await auditState(page, hostedPageContent, {
                state,
                theme,
                viewport,
              }),
            );
          } finally {
            await page.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const resultPath = path.join(outputDirectory, 'results.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);

  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        outputDirectory: path.relative(repoRoot, outputDirectory),
        resultPath: path.relative(repoRoot, resultPath),
        screenshotCount: results.length,
        failureCount: failures.length,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `${failure.viewport}/${failure.theme}/${failure.state}: ${failure.failures.join(
          '; ',
        )}`,
      );
    }
    process.exit(1);
  }
}

async function auditState(page, hostedPageContent, { state, theme, viewport }) {
  const url = `https://auth.audit.local/?state=${state.key}${
    state.key === 'signUp' ? '&screen_hint=signup' : ''
  }`;
  await page.route('**/*', (route) => route.fulfill({ body: '' }));
  await page.goto(url);
  await page.setContent(hostedPageContent, { waitUntil: 'load' });
  await page.evaluate(
    ({ nextState, nextTheme }) => {
      window.__ACME_OKTA_AUDIT_STATE__ = nextState;
      document.documentElement.setAttribute('data-acme-theme', nextTheme);
      window.syncHostedExperience?.();
    },
    { nextState: state.key, nextTheme: theme },
  );
  await page.waitForFunction(
    (expectedState) =>
      document.body.getAttribute('data-acme-auth-state') === expectedState,
    state.expectedAuthState ?? state.key,
  );
  await page.evaluate(() => window.syncHostedExperience?.());
  await page.waitForTimeout(80);

  const screenshotPath = path.join(
    outputDirectory,
    `${viewport.key}-${theme}-${state.key}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate((expectedTexts) => {
    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function describe(element) {
      const id = element.id ? `#${element.id}` : '';
      const className =
        typeof element.className === 'string'
          ? `.${element.className.trim().replace(/\s+/g, '.')}`
          : '';
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      return `${element.tagName.toLowerCase()}${id}${className}${
        text ? ` "${text.slice(0, 70)}"` : ''
      }`;
    }

    function rectOf(element) {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 100) / 100,
        top: Math.round(rect.top * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    }

    function overlaps(a, b) {
      return !(
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      );
    }

    function parseRgb(value) {
      const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const raw = hex[1];
        const expanded =
          raw.length === 3
            ? raw
                .split('')
                .map((part) => `${part}${part}`)
                .join('')
            : raw;
        return {
          r: Number.parseInt(expanded.slice(0, 2), 16),
          g: Number.parseInt(expanded.slice(2, 4), 16),
          b: Number.parseInt(expanded.slice(4, 6), 16),
          a: 1,
        };
      }

      const match = value.match(
        /rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d?(?:\.\d+)?))?\)/,
      );
      if (!match) {
        return null;
      }

      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    }

    function channel(value) {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    }

    function luminance(color) {
      return (
        0.2126 * channel(color.r) +
        0.7152 * channel(color.g) +
        0.0722 * channel(color.b)
      );
    }

    function contrastRatio(foreground, background) {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    }

    function nearestBackground(element) {
      let current = element;
      while (current) {
        const color = parseRgb(
          window.getComputedStyle(current).backgroundColor,
        );
        if (color && color.a > 0.05) {
          return color;
        }
        current = current.parentElement;
      }

      const fallback = parseRgb(
        window
          .getComputedStyle(document.documentElement)
          .getPropertyValue('--acme-background'),
      );
      return fallback || { r: 255, g: 255, b: 255, a: 1 };
    }

    const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
    const normalizedBodyText = bodyText.toLowerCase();
    const missingTexts = expectedTexts.filter(
      (expectedText) =>
        !normalizedBodyText.includes(expectedText.toLowerCase()),
    );
    const visibleFooterActions = Array.from(
      document.querySelectorAll(
        '#okta-login-container .siw-main-footer a, #okta-login-container .siw-main-footer button',
      ),
    )
      .filter(isVisible)
      .map((action) => ({
        tagName: action.tagName.toLowerCase(),
        text: (action.textContent || '').replace(/\s+/g, ' ').trim(),
        href: action.getAttribute('href') || '',
        dataSe: action.getAttribute('data-se') || '',
        oktaFlow: action.getAttribute('data-acme-okta-flow') || '',
        nativeOktaFlow: action.getAttribute('data-acme-okta-native-flow') || '',
        isFallback:
          action.getAttribute('data-acme-recovery-fallback') === 'true',
        className:
          typeof action.className === 'string'
            ? action.className
            : String(action.className || ''),
      }));
    const visibleRecoveryActions = visibleFooterActions.filter((action) =>
      /\bacme-auth-(?:recovery|unlock)-link\b/.test(action.className),
    );
    const visibleHelpLinks = visibleFooterActions.filter((action) => {
      const text = (action.text || '').trim().toLowerCase();
      return (
        text === 'help' || /\/help(?:\/|$)|\/help\/login/i.test(action.href)
      );
    });
    const duplicateRegistrationPrompt =
      /don'?t have an account\?\s*do not have an account\?/i.test(bodyText) ||
      /do not have an account\?\s*do not have an account\?/i.test(bodyText);
    const recoveryLinksUsingHelpRoute = visibleRecoveryActions.filter(
      (action) => /\/help\/login/i.test(action.href),
    );
    const recoveryLinksUsingHostedRoute = visibleRecoveryActions.filter(
      (action) =>
        /\/signin\/(?:forgot-password|unlock)(?:\/|$)/i.test(action.href),
    );
    const forgotPasswordActions = visibleRecoveryActions.filter((action) =>
      /forgot password/i.test(action.text),
    );
    const unlockAccountActions = visibleFooterActions.filter((action) =>
      /unlock account/i.test(action.text),
    );
    const recoveryLinksWithoutWidgetAction = visibleRecoveryActions.filter(
      (action) => {
        const hasNativeWidgetAction =
          !action.isFallback &&
          /^(forgot-password|forgotpassword|unlock|unlock-account)$/i.test(
            action.dataSe,
          );
        const hasConfiguredWidgetFlow = /^(resetPassword|unlockAccount)$/.test(
          action.oktaFlow,
        );
        const hasPreservedNativeWidgetFlow =
          /^(resetPassword|unlockAccount)$/.test(action.nativeOktaFlow);
        return (
          !hasConfiguredWidgetFlow &&
          !hasNativeWidgetAction &&
          !hasPreservedNativeWidgetFlow
        );
      },
    );
    const recoveryLinksWithoutFlowHref = visibleRecoveryActions.filter(
      (action) =>
        action.tagName === 'a' &&
        /^(resetPassword|unlockAccount)$/.test(action.oktaFlow) &&
        !/^(reset-password|unlock-account)$/i.test(
          action.href.replace(/^#/, ''),
        ),
    );

    const overflowNodes = Array.from(document.body.querySelectorAll('*'))
      .filter(isVisible)
      .map((element) => ({ element, rect: rectOf(element) }))
      .filter(
        ({ rect }) =>
          rect.left < -1 ||
          rect.right > window.innerWidth + 1 ||
          rect.width > window.innerWidth + 1,
      )
      .slice(0, 10)
      .map(({ element, rect }) => ({ node: describe(element), rect }));

    const hiddenHeadingLeaks = Array.from(
      document.querySelectorAll(
        '#okta-login-container .okta-form-title, #okta-login-container .o-form-head, #okta-login-container .siw-form-header, #okta-login-container .siw-main-header',
      ),
    )
      .filter(isVisible)
      .map((element) => describe(element));

    const labelControlGaps = Array.from(
      document.querySelectorAll(
        '#okta-login-container .o-form-fieldset, #okta-login-container [data-se^="o-form-fieldset"]',
      ),
    )
      .filter(isVisible)
      .map((fieldset) => {
        const label =
          fieldset.querySelector('label') ||
          fieldset.querySelector('[data-se="o-form-label"]');
        const control = fieldset.querySelector(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, .selectize-input',
        );

        if (!label || !control || !isVisible(label) || !isVisible(control)) {
          return null;
        }

        const labelRect = rectOf(label);
        const controlRect = rectOf(control);
        return {
          fieldset: describe(fieldset),
          label: describe(label),
          control: describe(control),
          gap: Math.round((controlRect.top - labelRect.bottom) * 100) / 100,
        };
      })
      .filter((entry) => entry && entry.gap > 18);

    const oversizedPasswordRequirements = Array.from(
      document.querySelectorAll(
        '#okta-login-container .acme-password-requirements, #okta-login-container .acme-password-requirements li',
      ),
    )
      .filter(isVisible)
      .map((element) => {
        const style = window.getComputedStyle(element);
        return {
          node: describe(element),
          fontSize: Number.parseFloat(style.fontSize || '0'),
          lineHeight: Number.parseFloat(style.lineHeight || '0'),
        };
      })
      .filter((entry) => entry.fontSize > 14 || entry.lineHeight > 20);

    const rememberCheckboxIssues = Array.from(
      document.querySelectorAll('#okta-login-container input[type="checkbox"]'),
    )
      .filter(isVisible)
      .map((input) => {
        const owner =
          input.closest(
            '.acme-remember-field, .remember-me, .custom-checkbox, [data-se*="remember"]',
          ) || input.parentElement;
        const label =
          (owner && owner.querySelector('label')) ||
          (input.id
            ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
            : null);
        const inputRect = rectOf(input);
        const labelRect = label && isVisible(label) ? rectOf(label) : null;
        const gap = labelRect
          ? Math.round((labelRect.left - inputRect.right) * 100) / 100
          : null;
        const verticalCenterDelta = labelRect
          ? Math.round(
              Math.abs(
                labelRect.top +
                  labelRect.height / 2 -
                  (inputRect.top + inputRect.height / 2),
              ) * 100,
            ) / 100
          : null;
        const hasIssue =
          !labelRect ||
          inputRect.width > 24 ||
          inputRect.height > 24 ||
          gap < 2 ||
          gap > 18 ||
          verticalCenterDelta > 8;
        const primaryControl = document.querySelector(
          '#okta-login-container input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), #okta-login-container select, #okta-login-container textarea',
        );
        const primaryRect =
          primaryControl && isVisible(primaryControl)
            ? rectOf(primaryControl)
            : null;
        const isOnPrimaryControlRow =
          primaryRect && inputRect.top < primaryRect.bottom + 8;

        return hasIssue || isOnPrimaryControlRow
          ? {
              input: describe(input),
              label: label ? describe(label) : null,
              inputRect,
              labelRect,
              gap,
              verticalCenterDelta,
              isOnPrimaryControlRow,
            }
          : null;
      })
      .filter(Boolean);

    const visibleRememberMeNodes = Array.from(
      document.querySelectorAll(
        '#okta-login-container input[name="rememberMe"], #okta-login-container [data-se="o-form-fieldset-rememberMe"], #okta-login-container [data-se*="remember"], #okta-login-container .remember-me, #okta-login-container .acme-remember-field, #okta-login-container .acme-remember-fieldset',
      ),
    )
      .filter((element) => {
        const identity = [
          element.textContent,
          element.getAttribute('name'),
          element.getAttribute('id'),
          element.getAttribute('data-se'),
          element.className,
        ]
          .join(' ')
          .toLowerCase();
        return (
          isVisible(element) &&
          (identity.includes('keep me signed') || identity.includes('remember'))
        );
      })
      .map((element) => describe(element));

    const hasEmailLinkCodeChoice =
      normalizedBodyText.includes('we sent an email') &&
      normalizedBodyText.includes('code');
    const visibleEmailCodeFallbackFields = hasEmailLinkCodeChoice
      ? Array.from(
          document.querySelectorAll(
            '#okta-login-container .o-form-fieldset, #okta-login-container .okta-form-fieldset, #okta-login-container .form-fieldset, #okta-login-container [data-se^="o-form-fieldset"]',
          ),
        )
          .filter(isVisible)
          .filter((fieldset) => {
            const fieldText = (fieldset.textContent || '').toLowerCase();
            return (
              (fieldText.includes('enter code') ||
                fieldText.includes('verification code')) &&
              fieldset.querySelector(
                'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
              )
            );
          })
          .map((fieldset) => describe(fieldset))
      : [];
    const visibleEmailCodeSubmitButtons = hasEmailLinkCodeChoice
      ? Array.from(
          document.querySelectorAll(
            '#okta-login-container .o-form-button-bar, #okta-login-container .button-bar',
          ),
        )
          .filter(isVisible)
          .filter((buttonBar) => {
            const buttonText = (buttonBar.textContent || '').toLowerCase();
            return (
              buttonText.trim() === 'verify' ||
              Boolean(
                buttonBar.querySelector(
                  'input[type="submit"][value*="Verify"], input[type="button"][value*="Verify"]',
                ),
              )
            );
          })
          .map((buttonBar) => describe(buttonBar))
      : [];

    const radioOptionIssues = Array.from(
      document.querySelectorAll('#okta-login-container input[type="radio"]'),
    )
      .filter(isVisible)
      .map((radio) => {
        const option = radio.closest('.acme-radio-option');
        const label =
          (option && option.querySelector('label')) ||
          (radio.id
            ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)
            : null);
        const radioRect = rectOf(radio);
        const labelRect = label && isVisible(label) ? rectOf(label) : null;
        const gap = labelRect
          ? Math.round((labelRect.left - radioRect.right) * 100) / 100
          : null;
        const verticalCenterDelta = labelRect
          ? Math.round(
              Math.abs(
                labelRect.top +
                  labelRect.height / 2 -
                  (radioRect.top + radioRect.height / 2),
              ) * 100,
            ) / 100
          : null;
        const hasIssue =
          !option ||
          !labelRect ||
          gap < 2 ||
          gap > 18 ||
          verticalCenterDelta > 7 ||
          overlaps(radioRect, labelRect);

        return hasIssue
          ? {
              radio: describe(radio),
              label: label ? describe(label) : null,
              radioRect,
              labelRect,
              gap,
              verticalCenterDelta,
            }
          : null;
      })
      .filter(Boolean);

    const inlineErrorIssues = Array.from(
      document.querySelectorAll(
        '#okta-login-container .acme-inline-field-error',
      ),
    )
      .filter(isVisible)
      .map((row) => {
        const icon = row.querySelector('.acme-inline-field-error__icon');
        const text = row.querySelector('.acme-inline-field-error__text');

        if (!icon || !text || !isVisible(icon) || !isVisible(text)) {
          return {
            row: describe(row),
            issue: 'missing visible icon or text',
          };
        }

        const iconRect = rectOf(icon);
        const textRect = rectOf(text);
        const verticalCenterDelta =
          Math.round(
            Math.abs(
              iconRect.top +
                iconRect.height / 2 -
                (textRect.top + textRect.height / 2),
            ) * 100,
          ) / 100;
        const horizontalGap =
          Math.round((textRect.left - iconRect.right) * 100) / 100;

        return verticalCenterDelta > 6 ||
          horizontalGap < 2 ||
          textRect.height > 26
          ? {
              row: describe(row),
              issue: 'icon and text are not aligned',
              iconRect,
              textRect,
              verticalCenterDelta,
              horizontalGap,
            }
          : null;
      })
      .filter(Boolean);

    const importantElements = Array.from(
      document.querySelectorAll(
        '#okta-login-container label, #okta-login-container input, #okta-login-container select, #okta-login-container button, #okta-login-container .button, #okta-login-container a, #okta-login-container .acme-authenticator-badge, #okta-login-container .acme-auth-hint',
      ),
    ).filter(isVisible);
    const importantRects = importantElements.map((element) => ({
      element,
      rect: rectOf(element),
    }));
    const overlapPairs = [];

    for (
      let outerIndex = 0;
      outerIndex < importantRects.length;
      outerIndex += 1
    ) {
      for (
        let innerIndex = outerIndex + 1;
        innerIndex < importantRects.length;
        innerIndex += 1
      ) {
        const outer = importantRects[outerIndex];
        const inner = importantRects[innerIndex];
        if (
          outer.element.contains(inner.element) ||
          inner.element.contains(outer.element)
        ) {
          continue;
        }
        if (overlaps(outer.rect, inner.rect)) {
          overlapPairs.push({
            a: describe(outer.element),
            b: describe(inner.element),
            aRect: outer.rect,
            bRect: inner.rect,
          });
        }
      }
    }

    const contrastTargets = Array.from(
      document.querySelectorAll(
        '.acme-auth-title, .acme-auth-subtitle, .acme-auth-guidance, #okta-login-container label, #okta-login-container input, #okta-login-container select, #okta-login-container .button-primary, #okta-login-container a, .acme-auth-support, .acme-auth-hint__body',
      ),
    )
      .filter(isVisible)
      .map((element) => {
        const style = window.getComputedStyle(element);
        const foreground = parseRgb(style.color);
        const background = nearestBackground(element);
        return {
          node: describe(element),
          ratio:
            foreground && background
              ? Math.round(contrastRatio(foreground, background) * 100) / 100
              : null,
        };
      })
      .filter((target) => target.ratio !== null);
    const lowContrastNodes = contrastTargets
      .filter((target) => target.ratio < 4.5)
      .slice(0, 10);

    const widget = document.querySelector(
      '#okta-login-container #okta-sign-in',
    );
    const widgetRect = widget ? rectOf(widget) : null;
    const authenticatorCards = Array.from(
      document.querySelectorAll(
        '#okta-login-container .acme-authenticator-item',
      ),
    )
      .filter(isVisible)
      .map((element) => rectOf(element));
    const authenticatorActions = Array.from(
      document.querySelectorAll(
        '#okta-login-container .acme-authenticator-item .acme-authenticator-action',
      ),
    )
      .filter(isVisible)
      .map((element) => ({
        node: describe(element),
        rect: rectOf(element),
        text: (element.textContent || element.value || '').trim(),
      }));

    return {
      bodyText,
      missingTexts,
      overflowNodes,
      hiddenHeadingLeaks,
      overlapPairs: overlapPairs.slice(0, 10),
      lowContrastNodes,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      widgetRect,
      authenticatorCards,
      authenticatorActions,
      visibleFooterLinks: visibleFooterActions,
      visibleRecoveryLinks: visibleRecoveryActions,
      visibleHelpLinks,
      visibleRememberMeNodes,
      visibleEmailCodeFallbackFields,
      visibleEmailCodeSubmitButtons,
      radioOptionIssues,
      duplicateRegistrationPrompt,
      recoveryLinksUsingHelpRoute,
      recoveryLinksUsingHostedRoute,
      forgotPasswordActions,
      unlockAccountActions,
      recoveryLinksWithoutWidgetAction,
      recoveryLinksWithoutFlowHref,
      labelControlGaps: labelControlGaps.slice(0, 10),
      oversizedPasswordRequirements: oversizedPasswordRequirements.slice(0, 10),
      rememberCheckboxIssues: rememberCheckboxIssues.slice(0, 10),
      inlineErrorIssues: inlineErrorIssues.slice(0, 10),
    };
  }, state.expectedTexts);

  const failures = [];
  if (metrics.missingTexts.length > 0) {
    failures.push(`missing text: ${metrics.missingTexts.join(', ')}`);
  }
  if (metrics.overflowNodes.length > 0) {
    failures.push(`horizontal overflow: ${metrics.overflowNodes[0].node}`);
  }
  if (metrics.hiddenHeadingLeaks.length > 0) {
    failures.push(
      `visible Okta heading leak: ${metrics.hiddenHeadingLeaks[0]}`,
    );
  }
  if (metrics.labelControlGaps.length > 0) {
    failures.push(
      `detached field label: ${metrics.labelControlGaps[0].label} to ${metrics.labelControlGaps[0].control} (${metrics.labelControlGaps[0].gap}px)`,
    );
  }
  if (metrics.oversizedPasswordRequirements.length > 0) {
    failures.push(
      `oversized password requirements: ${metrics.oversizedPasswordRequirements[0].node} (${metrics.oversizedPasswordRequirements[0].fontSize}px)`,
    );
  }
  if (metrics.overlapPairs.length > 0) {
    failures.push(
      `overlap: ${metrics.overlapPairs[0].a} with ${metrics.overlapPairs[0].b}`,
    );
  }
  if (metrics.lowContrastNodes.length > 0) {
    failures.push(
      `low contrast: ${metrics.lowContrastNodes[0].node} (${metrics.lowContrastNodes[0].ratio})`,
    );
  }
  if (
    state.key === 'emailLink' &&
    metrics.visibleEmailCodeFallbackFields.length === 0
  ) {
    failures.push(
      'email code field is not visible after Okta sends the verification email',
    );
  }
  if (
    state.key === 'emailLink' &&
    metrics.visibleEmailCodeSubmitButtons.length === 0
  ) {
    failures.push(
      'email verify action is not visible after Okta sends the verification email',
    );
  }
  if (metrics.radioOptionIssues.length > 0) {
    failures.push(
      `radio option misaligned: ${metrics.radioOptionIssues[0].radio}`,
    );
  }
  if (!metrics.widgetRect || metrics.widgetRect.height < 80) {
    failures.push('hosted widget rendered too small or blank');
  }
  if (state.key === 'signIn') {
    if (metrics.visibleHelpLinks.length > 0) {
      failures.push('help link is visible in sign-in footer');
    }
    if (
      metrics.visibleFooterLinks.length > 0 &&
      metrics.visibleFooterLinks.length < 2
    ) {
      failures.push('sign-in footer is missing an expected account action');
    }
    if (
      metrics.visibleFooterLinks.length > 0 &&
      metrics.visibleRecoveryLinks.length === 0
    ) {
      failures.push('sign-in footer is missing recovery actions');
    }
    if (metrics.duplicateRegistrationPrompt) {
      failures.push('duplicate registration prompt in sign-in footer');
    }
    if (metrics.recoveryLinksUsingHelpRoute.length > 0) {
      failures.push('recovery link points to Okta help instead of recovery');
    }
    if (metrics.recoveryLinksUsingHostedRoute.length > 0) {
      failures.push('recovery link points to a non-existent hosted route');
    }
    if (metrics.forgotPasswordActions.length === 0) {
      failures.push('forgot password action is missing');
    }
    if (metrics.unlockAccountActions.length > 0) {
      failures.push('unlock account action is visible in sign-in footer');
    }
    if (metrics.recoveryLinksWithoutWidgetAction.length > 0) {
      failures.push('recovery link is not wired to an Okta widget action');
    }
    if (metrics.recoveryLinksWithoutFlowHref.length > 0) {
      failures.push('recovery link is missing the local widget-flow hash');
    }
    if (metrics.visibleRememberMeNodes.length > 0) {
      failures.push('keep-me-signed-in checkbox is visible');
    }
    if (metrics.rememberCheckboxIssues.length > 0) {
      failures.push('keep-me-signed-in checkbox is misaligned');
    }
    if (metrics.inlineErrorIssues.length > 0) {
      failures.push('field error icon and text are not aligned');
    }
  }
  if (
    state.key === 'enroll' &&
    metrics.authenticatorCards.some(
      (rect) => rect.width < Math.min(320, viewport.width - 60),
    )
  ) {
    failures.push('authenticator card did not fill the available width');
  }
  if (
    state.key === 'enroll' &&
    metrics.authenticatorActions.some((action) => action.rect.width > 92)
  ) {
    failures.push(
      `authenticator setup action is too wide: ${metrics.authenticatorActions.find((action) => action.rect.width > 92).node}`,
    );
  }

  return {
    viewport: viewport.key,
    theme,
    state: state.key,
    screenshotPath: path.relative(repoRoot, screenshotPath),
    documentWidth: metrics.documentWidth,
    viewportWidth: metrics.viewportWidth,
    widgetRect: metrics.widgetRect,
    authenticatorCards: metrics.authenticatorCards,
    authenticatorActions: metrics.authenticatorActions,
    labelControlGaps: metrics.labelControlGaps,
    oversizedPasswordRequirements: metrics.oversizedPasswordRequirements,
    visibleRememberMeNodes: metrics.visibleRememberMeNodes,
    visibleEmailCodeFallbackFields: metrics.visibleEmailCodeFallbackFields,
    visibleEmailCodeSubmitButtons: metrics.visibleEmailCodeSubmitButtons,
    radioOptionIssues: metrics.radioOptionIssues,
    rememberCheckboxIssues: metrics.rememberCheckboxIssues,
    inlineErrorIssues: metrics.inlineErrorIssues,
    failures,
    ok: failures.length === 0,
  };
}

function toAuditHtml(pageContent, fixtures) {
  const widgetResources = `
    <script>
      window.__ACME_OKTA_AUDIT_FIXTURES__ = ${JSON.stringify(fixtures)};
      window.__ACME_OKTA_AUDIT_STATE__ = new URL(window.location.href).searchParams.get('state') || 'signIn';
      window.OktaSignIn = function OktaSignIn(config) {
          this.config = config;
      };
      window.OktaSignIn.prototype.renderEl = function renderEl(target) {
          var container = document.querySelector(target.el);
          if (!container) {
              return;
          }
          var key = window.__ACME_OKTA_AUDIT_STATE__ || 'signIn';
          container.innerHTML = window.__ACME_OKTA_AUDIT_FIXTURES__[key] || window.__ACME_OKTA_AUDIT_FIXTURES__.signIn;
      };
    </script>
  `;
  const oktaUtil = `
    <script>
      window.OktaUtil = {
          getSignInWidgetConfig: function getSignInWidgetConfig() {
              return { features: {}, i18n: { en: {} } };
          },
          completeLogin: function completeLogin() {}
      };
    </script>
  `;

  return pageContent
    .replaceAll('{{themedStylesUrl}}', 'data:text/css,')
    .replaceAll('{{faviconUrl}}', 'data:image/x-icon;base64,')
    .replaceAll('{{pageTitle}}', 'ACME LOS Hosted Auth Audit')
    .replaceAll('{{nonceValue}}', '')
    .replace('{{{SignInWidgetResources}}}', widgetResources)
    .replace('{{{OktaUtil}}}', oktaUtil);
}

function loadHostedBranding(name) {
  const environmentPath = path.join(
    repoRoot,
    'infra',
    'okta',
    'environments',
    `${name}.json`,
  );
  const brandPath = path.join(
    repoRoot,
    'infra',
    'okta',
    'brand',
    'acme-los.json',
  );

  if (!fs.existsSync(environmentPath)) {
    throw new Error(`Unknown Okta environment "${name}".`);
  }

  const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
  const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
  const deployedWebBaseUrl = requiredString(
    environment.web?.deployedBaseUrl ?? environment.web?.baseUrl,
    'web.deployedBaseUrl or web.baseUrl',
  );
  const themeCookieDomain =
    optionalString(environment.okta?.hostedExperience?.themeCookieDomain) ?? '';

  return {
    DefaultBrandName: requiredString(
      brand.defaultBrandName,
      'brand.defaultBrandName',
    ),
    BrandName: requiredString(
      brand.customerBrandName,
      'brand.customerBrandName',
    ),
    ProductName: requiredString(brand.productName, 'brand.productName'),
    SupportPhone: requiredString(brand.supportPhone, 'brand.supportPhone'),
    SupportHours: requiredString(brand.supportHours, 'brand.supportHours'),
    LogoUrl: toAbsoluteUrl(
      deployedWebBaseUrl,
      requiredString(brand.logoPath, 'brand.logoPath'),
    ),
    FaviconUrl: toAbsoluteUrl(
      deployedWebBaseUrl,
      requiredString(brand.iconPath, 'brand.iconPath'),
    ),
    PrimaryColor: requiredString(brand.primaryColor, 'brand.primaryColor'),
    PrimaryContrastColor: requiredString(
      brand.primaryContrastColor,
      'brand.primaryContrastColor',
    ),
    SecondaryColor: requiredString(
      brand.secondaryColor,
      'brand.secondaryColor',
    ),
    BackgroundColor: requiredString(
      brand.backgroundColor,
      'brand.backgroundColor',
    ),
    SurfaceColor: requiredString(brand.surfaceColor, 'brand.surfaceColor'),
    TextColor: requiredString(brand.textColor, 'brand.textColor'),
    MutedTextColor: requiredString(
      brand.mutedTextColor,
      'brand.mutedTextColor',
    ),
    LinkColor: requiredString(brand.linkColor, 'brand.linkColor'),
    BorderColor: requiredString(brand.borderColor, 'brand.borderColor'),
    FocusColor: requiredString(brand.focusColor, 'brand.focusColor'),
    AccentColor: requiredString(brand.accentColor, 'brand.accentColor'),
    PrivacyPolicyUrl: toAbsoluteUrl(
      deployedWebBaseUrl,
      requiredString(brand.privacyPolicyPath, 'brand.privacyPolicyPath'),
    ),
    TermsUrl: toAbsoluteUrl(
      deployedWebBaseUrl,
      requiredString(brand.termsPath, 'brand.termsPath'),
    ),
    HelpUrl: toAbsoluteUrl(
      deployedWebBaseUrl,
      requiredString(brand.helpPath, 'brand.helpPath'),
    ),
    SignInTitle: requiredString(brand.signInTitle, 'brand.signInTitle'),
    SignInSubtitle: requiredString(
      brand.signInSubtitle,
      'brand.signInSubtitle',
    ),
    SignUpTitle: requiredString(brand.signUpTitle, 'brand.signUpTitle'),
    SignUpSubtitle: requiredString(
      brand.signUpSubtitle,
      'brand.signUpSubtitle',
    ),
    ThemeCookieDomain: themeCookieDomain,
  };
}

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${fieldName}" to be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toAbsoluteUrl(baseUrl, pathname) {
  return new URL(
    requiredString(pathname, 'path'),
    requiredString(baseUrl, 'baseUrl'),
  ).toString();
}

function widgetShell(body, footer = '') {
  return `
    <div id="okta-sign-in" class="auth-container main-container">
        <div class="siw-main-view">
            <div class="auth-content">
                <div class="auth-content-inner">
                    ${body}
                </div>
            </div>
            ${footer}
        </div>
    </div>
  `;
}

function formField(label, inputMarkup) {
  return `
    <div class="o-form-fieldset o-form-label-top margin-btm-30" data-se="o-form-fieldset-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}">
        <div class="okta-form-label o-form-label" data-se="o-form-label">
            <label>${label}</label>
        </div>
        <div class="o-form-input-container" data-se="o-form-input-container">
            <div class="o-form-input">${inputMarkup}</div>
        </div>
    </div>
  `;
}

function passwordRequirementsFixture() {
  return `
    <div class="password-requirements" data-se="password-requirements">
        <p>Password requirements:</p>
        <ul>
            <li>At least 8 characters</li>
            <li>A lowercase letter</li>
            <li>An uppercase letter</li>
            <li>A number</li>
            <li>No parts of your username</li>
        </ul>
    </div>
  `;
}

function buildSignInFixture() {
  return widgetShell(
    `
      <div class="siw-main-header">
          <h2 class="okta-form-title">Sign in</h2>
      </div>
      <div class="siw-main-body">
          <form class="o-form">
              <div class="o-form-content">
                  ${formField(
                    'Username',
                    [
                      '<input type="text" aria-invalid="true" value="" />',
                      '<div class="custom-checkbox" data-se="o-form-fieldset-rememberMe">',
                      '<input type="checkbox" id="kmsi" name="remember" style="position:absolute" />',
                      '<label for="kmsi">Keep me signed in</label>',
                      '</div>',
                    ].join(''),
                  )}
                  <span class="error-16 icon-16 o-form-input-error" data-se="o-form-input-error-icon" aria-hidden="true">!</span>
                  <p class="okta-form-input-error" data-se="o-form-input-error" role="alert">This field cannot be left blank</p>
              </div>
              <div class="o-form-button-bar">
                  <input class="button button-primary" type="submit" value="Next" />
              </div>
          </form>
      </div>
    `,
    `
      <div class="siw-main-footer">
          <div class="auth-footer">
              <a data-se="help" href="https://auth.avanai.net/help/login" target="_blank" rel="noopener noreferrer" class="link js-help">Help</a>
              <a data-se="forgot-password" href="#" class="link js-forgot-password">Forgot password?</a>
              <a data-se="unlock" href="#" class="link js-unlock">Unlock account</a>
              <div class="footer-info">
                  <div class="signup-info">
                      <span>Don't have an account?</span>
                      <span class="signup-link">
                          <a data-se="enroll" href="#" class="link js-enroll">Sign up</a>
                      </span>
                  </div>
              </div>
          </div>
      </div>
    `,
  );
}

function buildSignUpFixture() {
  return widgetShell(
    `
      <div class="siw-main-header">
          <h2 class="okta-form-title">Create account</h2>
      </div>
      <div class="siw-main-body">
          <form class="o-form">
              <div class="o-form-content">
                  ${formField('Primary email', '<input type="email" />')}
                  ${formField('First name', '<input type="text" />')}
                  ${formField('Last name', '<input type="text" />')}
                  ${formField('Phone number', '<input type="tel" />')}
                  ${formField(
                    'State',
                    '<select><option>Select a state</option><option>Texas</option></select>',
                  )}
                  ${formField(
                    'Password',
                    '<input type="password" autocomplete="new-password" />',
                  )}
                  ${passwordRequirementsFixture()}
              </div>
              <div class="o-form-button-bar">
                  <input class="button button-primary" type="submit" value="Create account" />
              </div>
          </form>
      </div>
    `,
    `
      <div class="siw-main-footer">
          <div class="registration-container">
              <span>Already have an account?</span>
              <a class="registration-link" href="#">Sign in</a>
          </div>
      </div>
    `,
  );
}

function buildEnrollFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Set up security method</h2>
    </div>
    <div class="siw-main-body">
        <div class="authenticator-enrollments-list">
            <ul>
                ${authenticatorItem('Create Password', 'Password', 'Set up')}
                ${authenticatorItem('Verify Email', 'Email OTP', 'Set up')}
                ${authenticatorItem(
                  'Set up Security Question',
                  'Recovery question',
                  'Set up',
                )}
                ${authenticatorItem('Add Phone', 'SMS verification', 'Set up')}
            </ul>
        </div>
    </div>
  `);
}

function authenticatorItem(title, description, action) {
  return `
    <li>
        <div class="select-authenticator-authenticate">
            <div>
                <h3 class="select-authenticator-label">${title}</h3>
                <p>${description}</p>
            </div>
            <button class="button" type="button">${action}</button>
        </div>
    </li>
  `;
}

function buildVerifyFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Enter code</h2>
    </div>
    <div class="siw-main-body">
        <form class="o-form">
            <p data-se="identifier">vc4u2c+7@gmail.com</p>
            <div class="o-form-content">
                ${formField('Verification code', '<input type="text" />')}
            </div>
            <div class="o-form-button-bar">
                <input class="button button-primary" type="submit" value="Verify" />
            </div>
        </form>
    </div>
  `);
}

function buildEmailLinkFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Verify your identity</h2>
    </div>
    <div class="siw-main-body">
        <form class="o-form">
            <p data-se="identifier">vc4u2c+8@gmail.com</p>
            <div class="o-form-content">
                <div class="okta-form-infobox-success">
                    <p>We sent an email to v***8@gmail.com. Click the verification link in your email to continue or enter the code below.</p>
                    <a href="#" class="link">Enter a verification code instead</a>
                </div>
                ${formField('Enter code', '<input type="text" />')}
            </div>
            <div class="o-form-button-bar">
                <input class="button button-primary" type="submit" value="Verify" />
            </div>
        </form>
    </div>
  `);
}

function buildSecurityQuestionFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Set up security question</h2>
    </div>
    <div class="siw-main-body">
        <form class="o-form">
            <p data-se="identifier">vc4u2c+8@gmail.com</p>
            <div class="o-form-content">
                <div class="o-form-fieldset" data-se="o-form-fieldset-questionType">
                    <label class="o-form-label">Choose a security question</label>
                    <input id="default-question" type="radio" name="questionType" checked />
                    <label for="default-question">Choose a security question</label>
                    <input id="custom-question" type="radio" name="questionType" />
                    <label for="custom-question">Create my own security question</label>
                </div>
                ${formField(
                  'Choose a security question',
                  '<select><option>What is the food you least liked as a child?</option></select>',
                )}
                ${formField('Answer', '<input type="password" />')}
            </div>
            <div class="o-form-button-bar">
                <input class="button button-primary" type="submit" value="Verify" />
            </div>
        </form>
    </div>
  `);
}

function buildRecoveryFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Forgot password</h2>
    </div>
    <div class="siw-main-body">
        <form class="o-form">
            <div class="o-form-content">
                ${formField('Email', '<input type="email" />')}
            </div>
            <div class="o-form-button-bar">
                <input class="button button-primary" type="submit" value="Send code" />
            </div>
        </form>
    </div>
  `);
}

function buildPasswordFixture() {
  return widgetShell(`
    <div class="siw-main-header">
        <h2 class="okta-form-title">Reset password</h2>
    </div>
    <div class="siw-main-body">
        <form class="o-form">
            <div class="o-form-content">
                ${formField('New password', '<input type="password" />')}
                ${formField('Repeat password', '<input type="password" />')}
            </div>
            <div class="o-form-button-bar">
                <input class="button button-primary" type="submit" value="Save password" />
            </div>
        </form>
    </div>
  `);
}

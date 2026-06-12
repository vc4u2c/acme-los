import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildHostedSignInPageContent } from './hosted-sign-in-page.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const hostedPageTemplateDirectory = path.join(scriptDirectory, 'templates');
const environmentName = process.argv[2] ?? 'dev';
const outputDirectory = path.join(repoRoot, 'tmp', 'okta-hosted-state-audit');

const scenarios = [
  {
    key: 'signIn',
    query: '',
    expectedFlow: undefined,
    expectedAuthState: 'signIn',
    expectedTexts: ['Email', 'Continue', 'Forgot password?', 'Unlock account'],
    expectedContextTexts: [
      'Customer sign in',
      'Continue your application',
      'Secure account access for application progress',
    ],
    expectedCustomHelpLink: {
      text: 'Forgot password?',
      widgetFlow: 'resetPassword',
    },
  },
  {
    key: 'signup',
    query: '?acme_widget_flow=signup',
    expectedFlow: 'signup',
    expectedAuthState: 'signup',
    expectedTexts: ['Create account', 'Email', 'Continue'],
    expectedContextTexts: [
      'Create account',
      'Start your secure profile',
      'protect your application access',
    ],
    expectedCustomHelpLink: {
      text: 'Forgot password?',
      widgetFlow: 'resetPassword',
    },
  },
  {
    key: 'resetPassword',
    query: '?acme_widget_flow=resetPassword',
    expectedFlow: 'resetPassword',
    expectedAuthState: 'resetPassword',
    expectedTexts: ['Forgot password', 'Email', 'Send recovery code'],
    expectedContextTexts: [
      'Password recovery',
      'Reset your password',
      'restoring access',
    ],
    expectedCustomHelpLink: {
      text: 'Back to sign in',
      widgetFlow: null,
    },
  },
  {
    key: 'unlockAccount',
    query: '?acme_widget_flow=unlockAccount',
    expectedFlow: 'unlockAccount',
    expectedAuthState: 'unlockAccount',
    expectedTexts: ['Unlock account', 'Email', 'Send unlock code'],
    expectedContextTexts: [
      'Account unlock',
      'Unlock your account',
      'regain access',
    ],
    expectedCustomHelpLink: {
      text: 'Back to sign in',
      widgetFlow: null,
    },
  },
];

const viewports = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 960, height: 900 },
];
const themes = ['light', 'dark'];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const branding = loadHostedBranding(environmentName);
  const hostedPageContent = toAuditHtml(buildHostedSignInPageContent(branding));

  fs.mkdirSync(outputDirectory, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        for (const scenario of scenarios) {
          const page = await browser.newPage({ viewport });
          try {
            results.push(
              await auditScenario(page, hostedPageContent, {
                scenario,
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
        `${failure.viewport}/${failure.theme}/${failure.scenario}: ${failure.failures.join(
          '; ',
        )}`,
      );
    }
    process.exit(1);
  }
}

async function auditScenario(
  page,
  hostedPageContent,
  { scenario, theme, viewport },
) {
  const url = `https://auth.audit.local/${scenario.query}`;
  await page.route('**/*', (route) => route.fulfill({ body: '' }));
  await page.goto(url);
  await page.setContent(hostedPageContent, { waitUntil: 'load' });
  await page.evaluate((themeName) => {
    document.documentElement.setAttribute('data-acme-theme', themeName);
  }, theme);
  await page.waitForSelector('#okta-login-container [data-audit-flow]');
  await page.waitForFunction(
    (expectedAuthState) =>
      document.documentElement.getAttribute('data-acme-auth-state') ===
      expectedAuthState,
    scenario.expectedAuthState,
  );

  const screenshotPath = path.join(
    outputDirectory,
    `${viewport.key}-${theme}-${scenario.key}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate((scenarioExpectations) => {
    const widgetConfig = window.__ACME_LAST_WIDGET_CONFIG__ || {};
    const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
    const normalizedBodyText = bodyText.toLowerCase();
    const authState = document.documentElement.getAttribute(
      'data-acme-auth-state',
    );
    const contextText = Array.from(
      document.querySelectorAll('[data-acme-auth-copy]'),
    )
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ');
    const normalizedContextText = contextText.toLowerCase();
    const widget = document.querySelector(
      '#okta-login-container [data-audit-flow]',
    );
    const widgetRect = widget?.getBoundingClientRect();
    const links = Array.from(
      document.querySelectorAll('#okta-login-container a'),
    ).map((link) => ({
      text: (link.textContent || '').replace(/\s+/g, ' ').trim(),
      href: link.getAttribute('href') || '',
      dataSe: link.getAttribute('data-se') || '',
    }));
    const configuredCustomHelpLinks = Array.isArray(
      widgetConfig.helpLinks?.custom,
    )
      ? widgetConfig.helpLinks.custom.map((link) => ({
          text: String(link?.text || ''),
          href: String(link?.href || ''),
        }))
      : [];

    return {
      bodyText,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      configuredFlow: widgetConfig.flow,
      configuredForgotPasswordHref: widgetConfig.helpLinks?.forgotPassword,
      configuredUnlockHref: widgetConfig.helpLinks?.unlock,
      configuredCustomHelpLinks,
      visibleLinks: links,
      authState,
      contextText,
      widgetRect: widgetRect
        ? {
            width: Math.round(widgetRect.width),
            height: Math.round(widgetRect.height),
          }
        : null,
      missingTexts: scenarioExpectations.expectedTexts.filter(
        (expectedText) =>
          !normalizedBodyText.includes(expectedText.toLowerCase()),
      ),
      missingContextTexts: scenarioExpectations.expectedContextTexts.filter(
        (expectedText) =>
          !normalizedContextText.includes(expectedText.toLowerCase()),
      ),
    };
  }, scenario);

  const failures = [];
  if (metrics.missingTexts.length > 0) {
    failures.push(`missing text: ${metrics.missingTexts.join(', ')}`);
  }
  if (!metrics.widgetRect || metrics.widgetRect.height < 40) {
    failures.push('hosted widget rendered too small or blank');
  }
  if (metrics.documentWidth > metrics.viewportWidth + 1) {
    failures.push(
      `document overflows viewport (${metrics.documentWidth}px > ${metrics.viewportWidth}px)`,
    );
  }
  if (metrics.configuredFlow !== scenario.expectedFlow) {
    failures.push(
      `widget flow mismatch: expected ${scenario.expectedFlow ?? 'default'}, got ${
        metrics.configuredFlow ?? 'default'
      }`,
    );
  }
  if (metrics.authState !== scenario.expectedAuthState) {
    failures.push(
      `auth context state mismatch: expected ${scenario.expectedAuthState}, got ${
        metrics.authState ?? 'none'
      }`,
    );
  }
  if (metrics.missingContextTexts.length > 0) {
    failures.push(
      `missing context text: ${metrics.missingContextTexts.join(', ')}`,
    );
  }
  if (
    !hasWidgetFlow(metrics.configuredForgotPasswordHref, 'resetPassword') ||
    !hasWidgetFlow(metrics.configuredUnlockHref, 'unlockAccount')
  ) {
    failures.push('recovery links are not configured with widget flow URLs');
  }
  const expectedCustomHelpLink = scenario.expectedCustomHelpLink;
  const configuredExpectedCustomLinks =
    expectedCustomHelpLink &&
    metrics.configuredCustomHelpLinks.filter(
      (link) => link.text === expectedCustomHelpLink.text,
    );
  if (!expectedCustomHelpLink || configuredExpectedCustomLinks.length !== 1) {
    failures.push(
      `expected one custom ${expectedCustomHelpLink?.text ?? 'help'} link, got ${
        configuredExpectedCustomLinks?.length ?? 0
      }`,
    );
  }
  if (configuredExpectedCustomLinks?.length === 1) {
    const [customHelpLink] = configuredExpectedCustomLinks;

    if (
      typeof expectedCustomHelpLink.widgetFlow === 'string' &&
      !hasWidgetFlow(customHelpLink.href, expectedCustomHelpLink.widgetFlow)
    ) {
      failures.push(
        `custom ${expectedCustomHelpLink.text} link does not point to ${expectedCustomHelpLink.widgetFlow}`,
      );
    }

    if (
      expectedCustomHelpLink.widgetFlow === null &&
      hasAnyWidgetFlow(customHelpLink.href)
    ) {
      failures.push(
        `custom ${expectedCustomHelpLink.text} link should return to default sign-in`,
      );
    }
  }
  if (
    metrics.visibleLinks.some((link) =>
      /\/signin\/(?:forgot-password|unlock)(?:\/|$)|\/help\/login/i.test(
        link.href,
      ),
    )
  ) {
    failures.push('visible recovery link points to a dead hosted/help route');
  }

  return {
    viewport: viewport.key,
    theme,
    scenario: scenario.key,
    screenshotPath: path.relative(repoRoot, screenshotPath),
    configuredFlow: metrics.configuredFlow,
    configuredForgotPasswordHref: metrics.configuredForgotPasswordHref,
    configuredUnlockHref: metrics.configuredUnlockHref,
    configuredCustomHelpLinks: metrics.configuredCustomHelpLinks,
    visibleLinks: metrics.visibleLinks,
    authState: metrics.authState,
    contextText: metrics.contextText,
    widgetRect: metrics.widgetRect,
    failures,
    ok: failures.length === 0,
  };
}

function hasWidgetFlow(href, expectedFlow) {
  if (typeof href !== 'string' || href.trim().length === 0) {
    return false;
  }

  try {
    return new URL(href).searchParams.get('acme_widget_flow') === expectedFlow;
  } catch {
    return false;
  }
}

function hasAnyWidgetFlow(href) {
  if (typeof href !== 'string' || href.trim().length === 0) {
    return false;
  }

  try {
    return new URL(href).searchParams.has('acme_widget_flow');
  } catch {
    return false;
  }
}

function toAuditHtml(pageContent) {
  const widgetResources = readHostedPageTemplate(
    'audit-sign-in-widget-resources.html',
  );
  const oktaUtil = readHostedPageTemplate('audit-okta-util.html');

  return pageContent
    .replaceAll('{{themedStylesUrl}}', 'data:text/css,')
    .replaceAll('{{faviconUrl}}', 'data:image/x-icon;base64,')
    .replaceAll('{{pageTitle}}', 'ACME LOS Hosted Auth Audit')
    .replaceAll('{{nonceValue}}', '')
    .replace('{{{SignInWidgetResources}}}', widgetResources)
    .replace('{{{OktaUtil}}}', oktaUtil);
}

function readHostedPageTemplate(templateFileName) {
  return fs
    .readFileSync(
      path.join(hostedPageTemplateDirectory, templateFileName),
      'utf8',
    )
    .trimEnd();
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

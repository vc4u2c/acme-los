import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildHostedSignInPageContent } from './hosted-sign-in-page.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const environmentName = process.argv[2] ?? 'dev';
const outputDirectory = path.join(repoRoot, 'tmp', 'okta-hosted-state-audit');

const scenarios = [
  {
    key: 'signIn',
    query: '',
    expectedFlow: undefined,
    expectedTexts: ['Email', 'Continue', 'Forgot password?', 'Unlock account'],
  },
  {
    key: 'signup',
    query: '?acme_widget_flow=signup',
    expectedFlow: 'signup',
    expectedTexts: ['Create account', 'Email', 'Continue'],
  },
  {
    key: 'resetPassword',
    query: '?acme_widget_flow=resetPassword',
    expectedFlow: 'resetPassword',
    expectedTexts: ['Forgot password', 'Email', 'Send recovery code'],
  },
  {
    key: 'unlockAccount',
    query: '?acme_widget_flow=unlockAccount',
    expectedFlow: 'unlockAccount',
    expectedTexts: ['Unlock account', 'Email', 'Send unlock code'],
  },
];

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
  const hostedPageContent = toAuditHtml(buildHostedSignInPageContent(branding));

  fs.mkdirSync(outputDirectory, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const scenario of scenarios) {
        const page = await browser.newPage({ viewport });
        try {
          results.push(
            await auditScenario(page, hostedPageContent, {
              scenario,
              viewport,
            }),
          );
        } finally {
          await page.close();
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
        `${failure.viewport}/${failure.scenario}: ${failure.failures.join(
          '; ',
        )}`,
      );
    }
    process.exit(1);
  }
}

async function auditScenario(page, hostedPageContent, { scenario, viewport }) {
  const url = `https://auth.audit.local/${scenario.query}`;
  await page.route('**/*', (route) => route.fulfill({ body: '' }));
  await page.goto(url);
  await page.setContent(hostedPageContent, { waitUntil: 'load' });
  await page.waitForSelector('#okta-login-container [data-audit-flow]');

  const screenshotPath = path.join(
    outputDirectory,
    `${viewport.key}-${scenario.key}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate((expectedTexts) => {
    const widgetConfig = window.__ACME_LAST_WIDGET_CONFIG__ || {};
    const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
    const normalizedBodyText = bodyText.toLowerCase();
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
    const customForgotPasswordLinks = widgetConfig.helpLinks?.custom?.filter(
      (link) => /forgot password/i.test(String(link?.text || '')),
    );

    return {
      bodyText,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      configuredFlow: widgetConfig.flow,
      configuredForgotPasswordHref: widgetConfig.helpLinks?.forgotPassword,
      configuredUnlockHref: widgetConfig.helpLinks?.unlock,
      configuredCustomForgotPasswordCount:
        customForgotPasswordLinks?.length ?? 0,
      visibleLinks: links,
      widgetRect: widgetRect
        ? {
            width: Math.round(widgetRect.width),
            height: Math.round(widgetRect.height),
          }
        : null,
      missingTexts: expectedTexts.filter(
        (expectedText) =>
          !normalizedBodyText.includes(expectedText.toLowerCase()),
      ),
    };
  }, scenario.expectedTexts);

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
  if (
    !hasWidgetFlow(metrics.configuredForgotPasswordHref, 'resetPassword') ||
    !hasWidgetFlow(metrics.configuredUnlockHref, 'unlockAccount')
  ) {
    failures.push('recovery links are not configured with widget flow URLs');
  }
  if (metrics.configuredCustomForgotPasswordCount !== 1) {
    failures.push(
      `expected one custom forgot-password link, got ${metrics.configuredCustomForgotPasswordCount}`,
    );
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
    scenario: scenario.key,
    screenshotPath: path.relative(repoRoot, screenshotPath),
    configuredFlow: metrics.configuredFlow,
    configuredForgotPasswordHref: metrics.configuredForgotPasswordHref,
    configuredUnlockHref: metrics.configuredUnlockHref,
    visibleLinks: metrics.visibleLinks,
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

function toAuditHtml(pageContent) {
  const widgetResources = `
    <script>
      window.OktaSignIn = function OktaSignIn(config) {
        this.config = config;
        window.__ACME_LAST_WIDGET_CONFIG__ = config;
      };
      window.OktaSignIn.prototype.renderEl = function renderEl(target) {
        var container = document.querySelector(target.el);
        if (!container) {
          return;
        }
        var flow = this.config.flow || 'signIn';
        var links = this.config.helpLinks || {};
        var forgotHref = links.forgotPassword || '#';
        var unlockHref = links.unlock || '#';
        var contentByFlow = {
          signIn: [
            '<section data-audit-flow="signIn">',
            '<h1>Sign in</h1>',
            '<label>Email<input type="email" /></label>',
            '<button type="button">Continue</button>',
            '<a data-se="forgot-password" href="' + forgotHref + '">Forgot password?</a>',
            '<a data-se="unlock" href="' + unlockHref + '">Unlock account</a>',
            '</section>'
          ].join(''),
          signup: [
            '<section data-audit-flow="signup">',
            '<h1>Create account</h1>',
            '<label>Email<input type="email" /></label>',
            '<button type="button">Continue</button>',
            '</section>'
          ].join(''),
          resetPassword: [
            '<section data-audit-flow="resetPassword">',
            '<h1>Forgot password</h1>',
            '<label>Email<input type="email" /></label>',
            '<button type="button">Send recovery code</button>',
            '</section>'
          ].join(''),
          unlockAccount: [
            '<section data-audit-flow="unlockAccount">',
            '<h1>Unlock account</h1>',
            '<label>Email<input type="email" /></label>',
            '<button type="button">Send unlock code</button>',
            '</section>'
          ].join('')
        };
        container.innerHTML = contentByFlow[flow] || contentByFlow.signIn;
      };
    </script>
  `;
  const oktaUtil = `
    <script>
      window.OktaUtil = {
        getSignInWidgetConfig: function getSignInWidgetConfig() {
          return { features: {}, helpLinks: { custom: [] } };
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

  if (!fs.existsSync(environmentPath)) {
    throw new Error(`Unknown Okta environment "${name}".`);
  }

  return {};
}

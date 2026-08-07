import { defineConfig, devices } from '@playwright/test';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4200';
const bffBaseURL =
  process.env['ACME_E2E_BFF_BASE_URL'] || 'http://127.0.0.1:7206';
const sharedWebSessionSecret =
  process.env['ACME_WEB_SESSION_SECRET'] || 'acme-los-web-e2e-session-secret';
const trustedBffProxySecret =
  process.env['ACME_BFF_TRUSTED_PROXY_SECRET'] ||
  'acme-los-bff-e2e-proxy-secret';
const localWebUrl = new URL(baseURL);
const localBffUrl = new URL(bffBaseURL);

const localWebServers = process.env['BASE_URL']
  ? undefined
  : [
      {
        command: 'node support/bff-fixture.mjs',
        url: `${bffBaseURL}/bff/health`,
        reuseExistingServer: !process.env['CI'],
        timeout: 30_000,
        env: {
          ...process.env,
          HOSTNAME: localBffUrl.hostname,
          PORT: localBffUrl.port || '7206',
        },
      },
      {
        command: 'node ../../tools/scripts/run-web-e2e-server.mjs',
        url: baseURL,
        reuseExistingServer: !process.env['CI'],
        timeout: 300_000,
        env: {
          ...process.env,
          ACME_BFF_BASE_URL: bffBaseURL,
          ACME_BFF_TRUSTED_PROXY_SECRET: trustedBffProxySecret,
          ACME_OKTA_CLIENT_ID: 'e2e-client',
          ACME_OKTA_ISSUER: `${bffBaseURL}/oauth2/default`,
          ACME_OKTA_POST_LOGOUT_REDIRECT_URI: `${baseURL}/`,
          ACME_OKTA_REDIRECT_URI: `${baseURL}/account/sign-in`,
          ACME_WEB_SESSION_SECRET: sharedWebSessionSecret,
          HOSTNAME: localWebUrl.hostname,
          NEXT_PUBLIC_OKTA_ISSUER: `${bffBaseURL}/oauth2/default`,
          PORT: localWebUrl.port || '4200',
        },
      },
    ];

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './src',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
  webServer: localWebServers,
});

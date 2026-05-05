import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4200';
const enableBffProxyE2E = process.env['ACME_E2E_ENABLE_BFF'] === '1';
const bffBaseURL =
  process.env['ACME_E2E_BFF_BASE_URL'] || 'http://127.0.0.1:7206';
const sharedWebSessionSecret =
  process.env['ACME_WEB_SESSION_SECRET'] || 'acme-los-web-e2e-session-secret';
const trustedBffProxySecret =
  process.env['ACME_BFF_TRUSTED_PROXY_SECRET'] ||
  'acme-los-bff-e2e-proxy-secret';

const nextWebServer = {
  command: 'node tools/scripts/run-web-e2e-server.mjs',
  url: baseURL,
  reuseExistingServer: true,
  cwd: workspaceRoot,
  env: {
    ...process.env,
    ACME_AUTH_PROVIDER: 'mock',
    ACME_WEB_SESSION_SECRET: sharedWebSessionSecret,
    HOSTNAME: '127.0.0.1',
    NEXT_PUBLIC_AUTH_PROVIDER: 'mock',
    PORT: '4200',
    ...(enableBffProxyE2E
      ? {
          ACME_BFF_BASE_URL: bffBaseURL,
          ACME_BFF_TRUSTED_PROXY_SECRET: trustedBffProxySecret,
        }
      : {}),
  },
  timeout: 180000,
} as const;

const webServer = enableBffProxyE2E
  ? [
      {
        command: `dotnet run --project apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj --urls=${bffBaseURL}`,
        url: bffBaseURL,
        reuseExistingServer: true,
        cwd: workspaceRoot,
        env: {
          ...process.env,
          ACME_WEB_SESSION_SECRET: sharedWebSessionSecret,
          ACME_BFF_TRUSTED_PROXY_SECRET: trustedBffProxySecret,
          ASPNETCORE_ENVIRONMENT: 'Development',
        },
        timeout: 180000,
      },
      nextWebServer,
    ]
  : nextWebServer;

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
  testIgnore: enableBffProxyE2E ? [] : ['**/bff-proxy.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Run your local dev server before starting the tests */
  webServer,
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
});

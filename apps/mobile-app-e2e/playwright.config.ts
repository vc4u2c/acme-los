import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';
import { join } from 'path';

const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4201';

export default defineConfig({
  testDir: './src',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
  },
  webServer: {
    command: 'node ../../tools/scripts/serve-expo-web-static.mjs --port 4201',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: join(workspaceRoot, 'apps/mobile-app'),
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});

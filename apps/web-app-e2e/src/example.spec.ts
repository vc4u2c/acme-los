import { test, expect } from '@playwright/test';

test('shows the web home and showcase route', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /Welcome web-app/i }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Open UI showcase/i }).click();
  await expect(
    page.getByRole('heading', { name: /Web primitives in one place/i }),
  ).toBeVisible();
});

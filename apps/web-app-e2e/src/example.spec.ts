import { test, expect } from '@playwright/test';

test('shows the web home and showcase route', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('main > section').first();

  await expect(
    page.getByRole('heading', {
      name: /A steadier installment application from first answer to funding/i,
    }),
  ).toBeVisible();
  await Promise.all([
    page.waitForURL('**/apply/personal-info'),
    hero.getByRole('link', { name: /Start application/i }).click(),
  ]);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Personal information and address/i,
    }),
  ).toBeVisible();

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /See the experience library/i }).click();
  await expect(
    page.getByRole('heading', { name: /Web primitives in one place/i }),
  ).toBeVisible();
});

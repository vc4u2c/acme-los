import { expect, test } from '@playwright/test';

test('shows the mobile app welcome message', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Welcome MobileApp')).toBeVisible();
  await expect(page.getByText(/You're up and running/i)).toBeVisible();
});

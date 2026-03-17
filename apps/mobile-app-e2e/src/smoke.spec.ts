import { expect, test } from '@playwright/test';

test('shows the mobile showcase primitives', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByText(
      /A steadier installment application from first answer to funding\./i,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Mobile app v\d+\.\d+\.\d+/i)).toBeVisible();
  await expect(page.getByText(/Mobile app v0\.0\.0/i)).toHaveCount(0);
  await expect(page.getByText(/Open mobile showcase/i)).toBeVisible();
  await page.getByText(/Open mobile showcase/i).click();
  await expect(
    page.getByText(/Gluestack primitives in one place/i),
  ).toBeVisible();
  await expect(page.getByText(/Input primitives/i)).toBeVisible();
  await expect(page.getByText(/Badges and status/i)).toBeVisible();
  await expect(page.locator('input').first()).toBeVisible();
  await expect(page.locator('textarea')).toBeVisible();
  await expect(page.getByText(/Save draft settings/i)).toBeVisible();
});

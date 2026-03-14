import { expect, test } from '@playwright/test';

const showcaseFieldColor = 'rgb(254, 254, 255)';

test('shows the mobile showcase primitives', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText(/Welcome mobile-app/i)).toBeVisible();
  await expect(page.getByText(/Open mobile showcase/i)).toHaveCSS(
    'color',
    showcaseFieldColor,
  );
  await page.getByText(/Open mobile showcase/i).click();
  await expect(
    page.getByText(/Gluestack primitives in one place/i),
  ).toBeVisible();
  await expect(page.getByText(/Input primitives/i)).toBeVisible();
  await expect(page.getByText(/Badges and status/i)).toBeVisible();
  await expect(page.locator('input').first()).toHaveCSS(
    'color',
    showcaseFieldColor,
  );
  await expect(page.locator('textarea')).toHaveCSS('color', showcaseFieldColor);
  await expect(page.getByText(/Save draft settings/i)).toHaveCSS(
    'color',
    showcaseFieldColor,
  );
});

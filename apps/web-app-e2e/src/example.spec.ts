import { test, expect } from '@playwright/test';

test('shows the web home, rendering demos, and showcase route', async ({
  page,
}) => {
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

  await page.goto('/rates-terms', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/revalidates every 60 seconds/i)).toBeVisible();

  await page.goto('/rendering-demo/server', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', {
      name: /This route renders on the server for every request/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('server-rendered-at')).toBeVisible();
  await expect(page.getByTestId('server-request-id')).toBeVisible();

  await page.goto('/rendering-demo/client', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', {
      name: /This route is intentionally client-rendered/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('client-hydration-state')).toHaveText(
    /Hydrated in the browser/i,
  );
  await expect(page.getByTestId('client-mounted-at')).not.toHaveText(
    /Hydrating/i,
  );
  await expect(page.getByTestId('client-browser-time')).not.toHaveText(
    /Waiting for the browser clock/i,
  );
  await expect(page.getByTestId('client-browser-details')).not.toHaveText(
    /Waiting for browser-only values/i,
  );
});

import { expect, test, type Page } from '@playwright/test';

const mockAuthStorageKey = 'acme-los-auth-mock-session';
const mockAuthBaseUrl = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

function createMockCustomerUser() {
  return {
    id: 'mock-start-customer-01',
    email: 'start.customer@acme-los.dev',
    displayName: 'Start Customer',
    firstName: 'Start',
    lastName: 'Customer',
    authenticationMethods: ['pwd', 'email', 'mfa'],
  };
}

async function primeAuthenticatedCustomer(page: Page) {
  const user = createMockCustomerUser();
  const serializedUser = JSON.stringify(user);

  await page.context().addCookies([
    {
      name: mockAuthStorageKey,
      value: encodeURIComponent(serializedUser),
      url: mockAuthBaseUrl,
      sameSite: 'Lax',
    },
  ]);

  await page.addInitScript(
    ({ key, user: authenticatedUser }) => {
      const serializedAuthenticatedUser = JSON.stringify(authenticatedUser);
      window.sessionStorage.setItem(key, serializedAuthenticatedUser);
      document.cookie = `${key}=${encodeURIComponent(serializedAuthenticatedUser)}; path=/; samesite=lax`;
    },
    {
      key: mockAuthStorageKey,
      user,
    },
  );
}

test('start application opens the first application step', async ({ page }) => {
  await primeAuthenticatedCustomer(page);
  await page.goto('/');

  const hero = page.locator('main > section').first();
  const startApplicationButton = hero.getByRole('button', {
    name: /Start application/i,
  });

  await expect(startApplicationButton).toBeVisible();
  await startApplicationButton.click();

  await expect(page).toHaveURL(/\/apply\/personal-info$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Personal information and address/i,
    }),
  ).toBeVisible();
});

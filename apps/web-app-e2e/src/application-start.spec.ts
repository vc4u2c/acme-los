import { expect, test, type Page } from '@playwright/test';
import { primeAuthenticatedCustomer } from '../support/auth';

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

async function primeCustomer(page: Page) {
  const user = createMockCustomerUser();
  await primeAuthenticatedCustomer(page, user);
}

test('start application opens the first application step', async ({ page }) => {
  await primeCustomer(page);
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

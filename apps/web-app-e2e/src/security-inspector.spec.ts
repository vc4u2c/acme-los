import { expect, test, type Page } from '@playwright/test';
import { e2eAuthCookieName, primeAuthenticatedCustomer } from '../support/auth';

function createMockSecurityUser() {
  return {
    id: 'mock-security-customer-01',
    email: 'security.customer@acme-los.dev',
    displayName: 'Security Customer',
    firstName: 'Security',
    lastName: 'Customer',
    authenticationMethods: ['pwd', 'email', 'mfa'],
  };
}

async function primeCustomer(page: Page) {
  const user = createMockSecurityUser();
  await primeAuthenticatedCustomer(page, user);
}

test('security inspector renders authenticated browser and server state', async ({
  page,
}) => {
  await primeCustomer(page);
  await page.goto('/security');

  await expect(
    page.getByRole('heading', {
      name: /Server auth state and browser storage/i,
    }),
  ).toBeVisible();
  await expect(page.getByText('Server session view')).toBeVisible();
  await expect(page.getByText('Browser-visible cookies')).toBeVisible();
  await expect(page.getByText(e2eAuthCookieName).first()).toBeVisible();
  await expect(page.getByText('Security inspector unavailable')).toHaveCount(0);
});

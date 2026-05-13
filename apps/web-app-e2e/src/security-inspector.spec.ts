import { expect, test, type Page } from '@playwright/test';

const mockAuthStorageKey = 'acme-los-auth-mock-session';
const mockAuthBaseUrl = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

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

async function primeAuthenticatedCustomer(page: Page) {
  const user = createMockSecurityUser();
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

test('security inspector renders authenticated browser and server state', async ({
  page,
}) => {
  await primeAuthenticatedCustomer(page);
  await page.goto('/security');

  await expect(
    page.getByRole('heading', {
      name: /Server auth state and browser storage/i,
    }),
  ).toBeVisible();
  await expect(page.getByText('Server session view')).toBeVisible();
  await expect(page.getByText('Browser-visible cookies')).toBeVisible();
  await expect(page.getByText(mockAuthStorageKey).first()).toBeVisible();
  await expect(page.getByText('Security inspector unavailable')).toHaveCount(0);
});

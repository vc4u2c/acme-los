import type { Page } from '@playwright/test';

export const e2eAuthCookieName = 'acme-los-e2e-auth';

export type E2eAuthUser = {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  customerId?: string;
  leadId?: string;
  authenticationMethods: string[];
};

export async function primeAuthenticatedCustomer(
  page: Page,
  user: E2eAuthUser,
): Promise<void> {
  const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

  await page.context().addCookies([
    {
      name: e2eAuthCookieName,
      value: encodeURIComponent(JSON.stringify(user)),
      url: baseURL,
      sameSite: 'Lax',
    },
  ]);
}

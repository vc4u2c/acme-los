import { test, expect, type Page } from '@playwright/test';

const mockAuthStorageKey = 'acme-los-auth-mock-session';
const mockAuthBaseUrl = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

async function navigate(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('ERR_ABORTED') ||
      message.includes('NS_BINDING_ABORTED')
    ) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    }

    throw error;
  }
}

function createMockCustomerUser() {
  return {
    id: 'mock-customer-01',
    email: 'taylor.customer@acme-los.dev',
    displayName: 'Taylor Customer',
    firstName: 'Taylor',
    lastName: 'Customer',
    authenticationMethods: ['pwd', 'email', 'mfa'],
  };
}

test('shows the web home, rendering demos, and showcase route', async ({
  page,
}) => {
  test.slow();
  const mockUser = createMockCustomerUser();
  const serializedUser = JSON.stringify(mockUser);

  await page.context().addCookies([
    {
      name: mockAuthStorageKey,
      value: encodeURIComponent(serializedUser),
      url: mockAuthBaseUrl,
      sameSite: 'Lax',
    },
  ]);

  await page.addInitScript(
    ({ key, user }) => {
      const serializedUser = JSON.stringify(user);
      window.sessionStorage.setItem(key, serializedUser);
      document.cookie = `${key}=${encodeURIComponent(serializedUser)}; path=/; samesite=lax`;
    },
    {
      key: mockAuthStorageKey,
      user: mockUser,
    },
  );

  await navigate(page, '/');
  const hero = page.locator('main > section').first();

  await expect(
    page.getByRole('heading', {
      name: /A steadier installment application from first answer to funding/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/^Local$/)).toBeVisible();
  await expect(
    hero.getByRole('button', { name: /Start application/i }),
  ).toBeVisible();
  await navigate(page, '/apply/personal-info');
  await expect(page).toHaveURL(/\/apply\/personal-info$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Personal information and address/i,
    }),
  ).toBeVisible();

  await navigate(page, '/');
  await expect(
    page.getByRole('heading', {
      name: /A steadier installment application from first answer to funding/i,
    }),
  ).toBeVisible();
  await navigate(page, '/showcase');
  await expect(
    page.getByRole('heading', { name: /Web primitives in one place/i }),
  ).toBeVisible();

  await navigate(page, '/rates-terms');
  await expect(
    page.getByRole('heading', {
      name: /Set expectations before applicants reach pre-approval/i,
    }),
  ).toBeVisible();

  await navigate(page, '/rendering-demo/static');
  await expect(
    page.getByRole('heading', {
      name: /This route is generated once and served as static HTML/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('static-generated-at')).toBeVisible();

  await navigate(page, '/rendering-demo/isr');
  await expect(
    page.getByRole('heading', {
      name: /This route revalidates on a timed interval/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('isr-refreshed-at')).toBeVisible();

  await navigate(page, '/rendering-demo/server');
  await expect(
    page.getByRole('heading', {
      name: /This route renders on the server for every request/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('server-rendered-at')).toBeVisible();
  await expect(page.getByTestId('server-request-id')).toBeVisible();

  await navigate(page, '/rendering-demo/client');
  await expect(
    page.getByRole('heading', {
      name: /This route is intentionally client-rendered/i,
    }),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId('client-hydration-state')).toHaveText(
    /Hydrated in the browser/i,
    { timeout: 25000 },
  );
  await expect(page.getByTestId('client-mounted-at')).not.toHaveText(
    /Hydrating/i,
    { timeout: 25000 },
  );
  await expect(page.getByTestId('client-browser-time')).not.toHaveText(
    /Waiting for the browser clock/i,
    { timeout: 25000 },
  );
  await expect(page.getByTestId('client-browser-details')).not.toHaveText(
    /Waiting for browser-only values/i,
    { timeout: 25000 },
  );

  await navigate(page, '/logging-demo');
  await expect(
    page.getByRole('heading', {
      name: /Follow a traceparent from browser telemetry to container logs/i,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('logging-demo-rendered-at')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Emit server-only log/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Run traced flow/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Log client error/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Log server error/i }),
  ).toBeVisible();
  await expect(page.getByTestId('logging-demo-server-result')).toHaveText(
    /No event emitted yet/i,
  );
  await expect(page.getByTestId('logging-demo-client-result')).toHaveText(
    /No event emitted yet/i,
  );
  await expect(page.getByTestId('logging-demo-client-error-result')).toHaveText(
    /No event emitted yet/i,
  );
  await expect(page.getByTestId('logging-demo-server-error-result')).toHaveText(
    /No event emitted yet/i,
  );
});

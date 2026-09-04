import { test, expect, type Locator, type Page } from '@playwright/test';
import { primeAuthenticatedCustomer } from '../support/auth';

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

async function selectTab(page: Page, name: RegExp) {
  const tab = page.getByRole('tab', { name });

  await expect(tab).toBeVisible();
  await expect(async () => {
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', {
      timeout: 1000,
    });
  }).toPass({ timeout: 10000 });
}

async function saveEditableGridRow(page: Page, editableTable: Locator) {
  await expect(async () => {
    const saveRowButton = page.getByRole('button', { name: /^Save row$/i });

    if (await saveRowButton.isVisible().catch(() => false)) {
      await saveRowButton.click();
    }

    await expect(
      editableTable.getByLabel(/Borrower name for GRID-\d{4}/),
    ).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10000 });
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
  await primeAuthenticatedCustomer(page, mockUser);

  await navigate(page, '/');
  const hero = page.locator('main > section').first();

  await expect(
    page.getByRole('heading', {
      name: /A steadier installment application that feels thoughtful before it feels transactional/i,
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
      name: /A steadier installment application that feels thoughtful before it feels transactional/i,
    }),
  ).toBeVisible();
  await navigate(page, '/showcase');
  await expect(
    page.getByRole('heading', { name: /Web primitives in one place/i }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: /Data grids/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('tab', { name: /Read-only sorting/i }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('showcase-grid-readonly-table')).toBeVisible();
  await expect(page.getByTestId('showcase-grid-pagination')).toBeVisible();
  await expect(page.getByText(/Ready \/ 360 rows/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/1 of 45/i)).toBeVisible();
  await expect(page.getByTestId('showcase-grid-page-indicator')).toHaveText(
    '1 / 45',
  );
  await expect(page.getByTestId('showcase-grid-readonly-table')).toContainText(
    /GRID-\d{4}/,
  );
  await expect(page.getByTestId('showcase-grid-readonly-table')).toContainText(
    /\$[\d,]+/,
  );
  await page.getByRole('button', { name: /^Next page$/i }).click();
  await expect(page.getByTestId('showcase-grid-page-indicator')).toHaveText(
    '2 / 45',
  );
  await expect(page.getByText(/2 of 45/i)).toBeVisible();
  await selectTab(page, /^Collapsible$/i);
  await expect(
    page.getByTestId('showcase-grid-collapsible-table'),
  ).toBeVisible();
  await expect(page.getByTestId('showcase-grid-pagination')).toBeVisible();
  await expect(page.getByTestId('showcase-grid-page-indicator')).toHaveText(
    '2 / 45',
  );
  await selectTab(page, /Column filters/i);
  await expect(page.getByTestId('showcase-grid-filter-table')).toBeVisible();
  await expect(page.getByTestId('showcase-grid-pagination')).toBeVisible();
  await page.getByRole('button', { name: /^Open Product filter$/i }).click();
  await page
    .getByRole('button', { name: /^Filter product by Equipment$/i })
    .click();
  await expect(page.getByTestId('showcase-grid-filter-queue')).toContainText(
    'product: Equipment',
  );
  await page
    .getByRole('button', { name: /^Hide GRID-\d{4}$/i })
    .first()
    .click();
  await expect(page.getByTestId('showcase-grid-filter-queue')).toContainText(
    /GRID-\d{4}/,
  );
  const officerColumnToggle = page.getByLabel(/^Toggle officer column$/i);
  const filterTable = page.getByTestId('showcase-grid-filter-table');

  await expect(officerColumnToggle).toBeChecked();
  await officerColumnToggle.uncheck();
  await expect(officerColumnToggle).not.toBeChecked();
  await expect(
    filterTable.getByRole('columnheader', { name: /^Officer$/i }),
  ).toHaveCount(0);
  await selectTab(page, /^Editable$/i);
  await expect(page.getByTestId('showcase-grid-table')).toBeVisible();
  await expect(page.getByTestId('showcase-grid-pagination')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Submit$/i })).toBeDisabled();
  await expect(page.getByLabel(/Borrower name for GRID-\d{4}/)).toHaveCount(0);
  const editableTable = page.getByTestId('showcase-grid-table');
  const firstEditButton = editableTable
    .getByRole('button', { name: /^Edit GRID-\d{4}$/i })
    .first();

  await expect(firstEditButton).toBeVisible();
  await firstEditButton.click();

  const borrowerNameInput = editableTable.getByLabel(
    /Borrower name for GRID-\d{4}/,
  );

  await expect(borrowerNameInput).toBeVisible();
  await borrowerNameInput.fill('Acme Edited Borrower');
  await saveEditableGridRow(page, editableTable);
  await expect(page.getByTestId('showcase-grid-table')).toContainText('Edited');
  await expect(page.getByRole('button', { name: /^Submit$/i })).toBeEnabled();
  await selectTab(page, /Web primitives/i);
  await expect(
    page.getByRole('heading', { name: /Input \+ Card/i }),
  ).toBeVisible();
  await selectTab(page, /Data grids/i);
  await expect(page.getByTestId('showcase-grid-readonly-table')).toBeVisible();
  await expect(page.getByTestId('showcase-grid-pagination')).toBeVisible();

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
    page.getByRole('button', { name: /Emit API event/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Call BFF trace API/i }),
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
  await expect(page.getByTestId('logging-demo-bff-trace-result')).toHaveText(
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

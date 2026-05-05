import { expect, test, type Page } from '@playwright/test';

const mockAuthStorageKey = 'acme-los-auth-mock-session';
const csrfCookieName = 'acme-los.csrf-token';
const mockAuthBaseUrl = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

function createMockCustomerUser() {
  return {
    id: 'mock-bff-customer-01',
    email: 'bff.customer@acme-los.dev',
    displayName: 'Bff Customer',
    firstName: 'Bff',
    lastName: 'Customer',
    customerId: 'customer-bff-01',
    leadId: 'lead-bff-01',
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

async function issueCsrfToken(page: Page) {
  const csrfResponse = await page.request.get('/api/security/csrf');
  const csrf = (await csrfResponse.json()) as { csrfToken: string };
  const csrfSetCookieHeader = csrfResponse.headers()['set-cookie'];
  const csrfCookieValue = csrfSetCookieHeader
    ?.split(/,\s*(?=[^;,]+=)/)
    .find((cookie) => cookie.startsWith(`${csrfCookieName}=`))
    ?.split(';')[0]
    ?.slice(csrfCookieName.length + 1);

  if (!csrfCookieValue) {
    throw new Error('Expected the CSRF endpoint to set the CSRF cookie.');
  }

  await page.context().addCookies([
    {
      httpOnly: true,
      name: csrfCookieName,
      sameSite: 'Lax',
      url: mockAuthBaseUrl,
      value: csrfCookieValue,
    },
  ]);

  return csrf;
}

test('customer and application routes proxy through the BFF', async ({
  page,
}) => {
  await primeAuthenticatedCustomer(page);
  await page.goto('/account/profile');
  await expect(
    page.getByRole('heading', { name: /Keep your contact details current/i }),
  ).toBeVisible();

  const csrf = await issueCsrfToken(page);
  const response = await page.evaluate(async ({ csrfToken }) => {
    const profile = await fetch('/api/customer/profile', {
      credentials: 'include',
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    const initialStep = await fetch('/api/application/steps/personal-info', {
      credentials: 'include',
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    const savedStep = await fetch('/api/application/steps/personal-info', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        payload: {
          firstName: 'Bff',
          annualIncome: 88000,
        },
      }),
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    const reloadedStep = await fetch('/api/application/steps/personal-info', {
      credentials: 'include',
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    const submitted = await fetch('/api/application/submit', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        step: 'pre-approval',
        payload: {
          approvedOffer: 'offer-a',
        },
      }),
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    const clearedStep = await fetch('/api/application/steps/pre-approval', {
      credentials: 'include',
    }).then(async (result) => ({
      status: result.status,
      body: (await result.json()) as Record<string, unknown>,
    }));

    return {
      profile,
      initialStep,
      savedStep,
      reloadedStep,
      submitted,
      clearedStep,
    };
  }, csrf);

  expect(response.profile.status).toBe(200);
  expect((response.profile.body.profile as Record<string, unknown>).email).toBe(
    'bff.customer@acme-los.dev',
  );

  expect(response.initialStep.status).toBe(200);
  expect(response.initialStep.body.stepState).toBeNull();

  expect(response.savedStep.status).toBe(200);
  expect(response.savedStep.body.stepState).toMatchObject({
    step: 'personal-info',
    payload: {
      firstName: 'Bff',
      annualIncome: 88000,
    },
    summary: {
      currentStep: 'personal-info',
      customerId: 'customer-bff-01',
      leadId: 'lead-bff-01',
    },
  });

  expect(response.reloadedStep.status).toBe(200);
  expect(response.reloadedStep.body.stepState).toMatchObject({
    step: 'personal-info',
    payload: {
      firstName: 'Bff',
      annualIncome: 88000,
    },
  });

  expect(response.submitted.status).toBe(200);
  expect(response.submitted.body.summary).toMatchObject({
    currentStep: 'pre-approval',
    customerId: 'customer-bff-01',
    leadId: 'lead-bff-01',
    completedSteps: ['personal-info', 'pre-approval'],
  });

  expect(response.clearedStep.status).toBe(200);
  expect(response.clearedStep.body.stepState).toBeNull();
});

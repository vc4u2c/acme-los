import { test, expect, type Page } from '@playwright/test';

const origin = 'https://okta.fixture.test';

function form(name: string, inputs: object[], password = false) {
  const isChallenge = name === 'challenge-authenticator';
  return {
    version: '1.0.0',
    stateHandle: 'fixture-state-handle',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    remediation: {
      type: 'array',
      value: [
        {
          rel: ['create-form'],
          name,
          href: `${origin}/idp/idx/${name}`,
          method: 'POST',
          accepts: 'application/json',
          ...(isChallenge ? { relatesTo: ['$.currentAuthenticator'] } : {}),
          value: [
            ...inputs,
            {
              name: 'stateHandle',
              value: 'fixture-state-handle',
              visible: false,
            },
          ],
        },
      ],
    },
    ...(isChallenge
      ? {
          currentAuthenticator: {
            type: 'object',
            value: {
              id: 'fixture-authenticator',
              key: password ? 'okta_password' : 'okta_email',
              type: password ? 'password' : 'email',
            },
          },
        }
      : {}),
  };
}

async function mockOkta(page: Page, initial: object, next: object) {
  const submissions: string[] = [];
  // These are browser/SDK contract tests. Isolate transaction creation so the
  // multi-browser matrix does not share one loopback client's abuse quota.
  await page.route('**/api/auth/idx/start', async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        issuer: `${origin}/oauth2/default`,
        clientId: 'e2e-client',
        redirectUri: `${new URL(page.url()).origin}/account/sign-in`,
        scopes: ['openid', 'profile', 'email'],
        state: 'e2e-state',
        nonce: 'e2e-nonce',
        codeChallenge: 'e2e-code-challenge',
        codeChallengeMethod: 'S256',
        transactionId: 'e2e-transaction',
        maxAge: 600,
        returnTo: payload.returnTo || '/account/profile',
        stepUpReason: null,
        maxAgeSeconds: null,
        acrValues: null,
      },
    });
  });
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': new URL(page.url()).origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
        },
      });
      return;
    }
    let body;
    if (path.endsWith('/.well-known/openid-configuration'))
      body = { code_challenge_methods_supported: ['S256'] };
    else if (path.endsWith('/v1/interact')) {
      const params = new URLSearchParams(route.request().postData() ?? '');
      expect(params.get('code_challenge')).toBe('e2e-code-challenge');
      expect(params.get('nonce')).toBe('e2e-nonce');
      body = { interaction_handle: 'fixture-interaction-handle' };
    } else if (path.endsWith('/introspect')) body = initial;
    else {
      submissions.push(path);
      body = next;
    }
    await route.fulfill({ json: body });
  });
  return submissions;
}

for (const width of [1440, 390]) {
  test(`registration renders its complete form at ${width}px after the structural SDK step`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const submissions = await mockOkta(
      page,
      form('select-enroll-profile', []),
      form('enroll-profile', [
        {
          name: 'userProfile',
          type: 'object',
          form: {
            value: [
              { name: 'email', required: true },
              { name: 'firstName', required: true },
              { name: 'lastName', required: true },
              {
                name: 'acmeState',
                required: true,
                options: [
                  {
                    label: 'display',
                    value: {
                      type: 'object',
                      value: {
                        inputType: 'select',
                        options: [{ label: 'Texas', value: 'TX' }],
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          name: 'credentials',
          type: 'object',
          form: { value: [{ name: 'passcode', secret: true, required: true }] },
        },
      ]),
    );
    await page.goto('/account/register');
    for (const label of ['Email', 'First name', 'Last name', 'Password']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
      'type',
      'password',
    );
    await page
      .getByRole('combobox', { name: 'State', exact: true })
      .selectOption('TX');
    await expect(
      page.getByRole('button', { name: 'Create account' }),
    ).toBeEnabled();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    expect(submissions).toEqual(['/idp/idx/select-enroll-profile']);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

for (const path of [
  '/account/sign-in',
  '/account/recover-password',
  '/account/unlock',
]) {
  test(`${path} renders an actionable identifier form`, async ({ page }) => {
    await mockOkta(
      page,
      form('identify', [{ name: 'identifier', required: true }]),
      {},
    );
    await page.goto(path);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  });
}

test('automatically delivered email opens the code field without a second send', async ({
  page,
}) => {
  const challenge = form('challenge-authenticator', [
    {
      name: 'credentials',
      type: 'object',
      required: true,
      form: { value: [{ name: 'passcode', required: true }] },
    },
  ]);
  const invalid = {
    ...challenge,
    messages: {
      type: 'array',
      value: [{ class: 'ERROR', message: 'The verification code is invalid.' }],
    },
  };
  const submissions = await mockOkta(page, challenge, invalid);
  await page.goto('/account/sign-in');
  const code = page.getByLabel('Verification code', { exact: true });
  await expect(code).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify code' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send email code' }),
  ).toHaveCount(0);
  expect(submissions).toEqual([]);
  await code.fill('000000');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'That verification code is not valid.' }),
  ).toBeVisible();
  await expect(code).toBeVisible();
  expect(submissions).toEqual(['/idp/idx/challenge-authenticator']);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('okta')),
    ),
  ).toEqual([]);
});

test('a password challenge returned after identification is masked', async ({
  page,
}) => {
  const challenge = form(
    'challenge-authenticator',
    [
      {
        name: 'credentials',
        type: 'object',
        required: true,
        form: { value: [{ name: 'passcode', required: true, secret: true }] },
      },
    ],
    true,
  );
  await mockOkta(
    page,
    form('identify', [{ name: 'identifier', required: true }]),
    challenge,
  );
  await page.goto('/account/sign-in');
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.com');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await expect(
    page.getByRole('button', { name: 'Verify password' }),
  ).toBeVisible();
});

for (const position of ['top', 'bottom'] as const) {
  test(`registration ${position} Sign in link survives duplicate email validation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const profile = form('enroll-profile', [
      {
        name: 'userProfile',
        type: 'object',
        form: { value: [{ name: 'email', required: true }] },
      },
    ]);
    await mockOkta(page, profile, {
      ...profile,
      messages: {
        type: 'array',
        value: [
          { class: 'ERROR', message: 'A user with this email already exists.' },
        ],
      },
    });
    await page.goto('/account/register');
    await page
      .getByLabel('Email', { exact: true })
      .fill('existing@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByText(/account with this email already exists/i),
    ).toBeVisible();
    const links = page.getByRole('link', { name: 'Sign in', exact: true });
    await expect(links).toHaveCount(2);
    await links.nth(position === 'top' ? 0 : 1).click();
    await expect(page).toHaveURL(/\/account\/sign-in\?/);
    await expect(
      page.getByRole('heading', { name: 'Continue your application' }),
    ).toBeVisible();
  });
}

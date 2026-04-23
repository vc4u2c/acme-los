import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockAuthStorageKey = 'acme-los-auth-mock-session';
const mockAuthBaseUrl = process.env['BASE_URL'] || 'http://127.0.0.1:4200';
const axeSource = readFileSync(
  join(__dirname, '..', '..', '..', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8',
);

const auditedRoutes = [
  {
    path: '/',
    waitFor: {
      role: 'heading',
      name: /A steadier installment application that feels thoughtful before it feels transactional\./i,
    },
  },
  {
    path: '/apply/personal-info',
    waitFor: { role: 'heading', name: /Personal information and address/i },
  },
  {
    path: '/rates-terms',
    waitFor: {
      role: 'heading',
      name: /Set expectations before applicants reach pre-approval/i,
    },
  },
  {
    path: '/account/sign-in',
    waitFor: { role: 'heading', name: /Opening secure sign in/i },
  },
  {
    path: '/account/profile',
    waitFor: { role: 'heading', name: /Keep your contact details current/i },
  },
  {
    path: '/logging-demo',
    waitFor: {
      role: 'heading',
      name: /Follow a traceparent from browser telemetry to container logs/i,
    },
  },
] as const;

type AxeViolation = {
  id: string;
  help: string;
  impact?: string | null;
  nodes: Array<{
    html: string;
    target: string[];
  }>;
};

type AxeWindow = Window & {
  axe: {
    run: (
      context: Document,
      options: {
        runOnly: {
          type: string;
          values: string[];
        };
      },
    ) => Promise<{ violations: AxeViolation[] }>;
  };
};

function createMockCustomerUser(assuranceLevel: 'aal1' | 'aal2' = 'aal2') {
  return {
    id: 'mock-customer-01',
    email: 'taylor.customer@acme-los.dev',
    displayName: 'Taylor Customer',
    firstName: 'Taylor',
    lastName: 'Customer',
    authenticationMethods:
      assuranceLevel === 'aal2' ? ['pwd', 'email', 'mfa'] : ['pwd'],
  };
}

async function primeAuthenticatedCustomer(
  page: Page,
  assuranceLevel: 'aal1' | 'aal2' = 'aal2',
) {
  const user = createMockCustomerUser(assuranceLevel);
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
    ({ key, user }) => {
      const serializedUser = JSON.stringify(user);
      window.sessionStorage.setItem(key, serializedUser);
      document.cookie = `${key}=${encodeURIComponent(serializedUser)}; path=/; samesite=lax`;
    },
    {
      key: mockAuthStorageKey,
      user,
    },
  );
}

async function prepareRoute(page: Page, path: string) {
  if (path.startsWith('/apply/') || path === '/account/profile') {
    await primeAuthenticatedCustomer(page);
  }
}

async function injectAxe(page: Page) {
  await page.addScriptTag({ content: axeSource });
}

async function getViolations(page: Page): Promise<AxeViolation[]> {
  await injectAxe(page);

  return page.evaluate(async () => {
    const results = await (window as unknown as AxeWindow).axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag22aa'],
      },
    });

    return results.violations;
  });
}

function formatViolations(violations: AxeViolation[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `- ${node.target.join(' ')} :: ${node.html}`)
        .join('\n');

      return `${violation.id} (${violation.impact ?? 'unknown'}) ${violation.help}\n${nodes}`;
    })
    .join('\n\n');
}

function getReadyHeading(
  page: Page,
  path: (typeof auditedRoutes)[number]['path'],
) {
  if (path === '/apply/personal-info') {
    return page.getByRole('heading', {
      level: 1,
      name: /Personal information and address/i,
    });
  }

  const route = auditedRoutes.find((item) => item.path === path);
  if (!route) {
    throw new Error(`No route configuration found for ${path}`);
  }

  return page.getByRole(route.waitFor.role, { name: route.waitFor.name });
}

test.describe('web accessibility', () => {
  test('skip link jumps to main content', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: /Skip to main content/i });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();

    await skipLink.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('apply form fields are exposed by accessible labels', async ({
    page,
  }) => {
    await primeAuthenticatedCustomer(page);
    await page.goto('/apply/personal-info');

    await expect(page.getByLabel(/First name/i)).toBeVisible();
    await expect(page.getByLabel(/Last name/i)).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
  });

  for (const route of auditedRoutes) {
    test(`axe smoke: ${route.path}`, async ({ page }) => {
      await prepareRoute(page, route.path);
      await page.goto(route.path);
      await expect(getReadyHeading(page, route.path)).toBeVisible();

      const violations = await getViolations(page);
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const axeSource = readFileSync(
  join(__dirname, '..', '..', '..', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8',
);

const auditedRoutes = [
  {
    path: '/',
    waitFor: {
      role: 'heading',
      name: /A steadier installment application from first answer to funding\./i,
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
    waitFor: { role: 'heading', name: /Sign in securely/i },
  },
  {
    path: '/account/create-account',
    waitFor: { role: 'heading', name: /Create your customer login/i },
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
    await page.goto('/apply/personal-info');

    await expect(page.getByLabel(/First name/i)).toBeVisible();
    await expect(page.getByLabel(/Last name/i)).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
  });

  for (const route of auditedRoutes) {
    test(`axe smoke: ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(getReadyHeading(page, route.path)).toBeVisible();

      const violations = await getViolations(page);
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});

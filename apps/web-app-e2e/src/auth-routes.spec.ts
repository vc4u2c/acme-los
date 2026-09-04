import { expect, test } from '@playwright/test';

test.describe('first-class account access routes', () => {
  test('sign-in links to dedicated recovery, unlock, and registration routes', async ({
    page,
  }) => {
    await page.goto('/account/sign-in?returnTo=%2Fapply%2Fpersonal-info');

    await expect(
      page.getByRole('heading', { name: /Preparing sign in/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Forgot password/i }),
    ).toHaveAttribute(
      'href',
      '/account/recover-password?returnTo=%2Fapply%2Fpersonal-info',
    );
    await expect(
      page.getByRole('link', { name: /Unlock account/i }),
    ).toHaveAttribute(
      'href',
      '/account/unlock?returnTo=%2Fapply%2Fpersonal-info',
    );
    await expect(
      page.getByRole('link', { name: /Create account/i }),
    ).toHaveAttribute(
      'href',
      '/account/register?returnTo=%2Fapply%2Fpersonal-info',
    );
  });

  for (const path of [
    '/account/register',
    '/account/recover-password',
    '/account/unlock',
  ]) {
    test(`${path} keeps a canonical sign-in link`, async ({ page }) => {
      await page.goto(`${path}?returnTo=%2Faccount%2Fprofile`);

      await expect(
        page
          .getByRole('navigation', { name: /Account access/i })
          .getByRole('link', { name: /^Sign in$/i }),
      ).toHaveAttribute(
        'href',
        '/account/sign-in?returnTo=%2Faccount%2Fprofile',
      );
    });
  }
});

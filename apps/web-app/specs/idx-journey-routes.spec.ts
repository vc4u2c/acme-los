import { buildIdxJourneyUrl } from '../src/lib/idx-journey-routes';

describe('IDX journey routes', () => {
  it.each([
    ['authenticate', '/account/sign-in'],
    ['register', '/account/register'],
    ['recoverPassword', '/account/recover-password'],
    ['unlockAccount', '/account/unlock'],
  ] as const)('builds the canonical %s route', (flow, pathname) => {
    expect(buildIdxJourneyUrl(flow, '/apply/personal-info')).toBe(
      `${pathname}?returnTo=%2Fapply%2Fpersonal-info`,
    );
  });
});

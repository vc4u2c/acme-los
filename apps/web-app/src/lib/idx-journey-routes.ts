import type { IdxJourneyFlow } from './idx-experience';

const idxJourneyPaths: Record<IdxJourneyFlow, string> = {
  authenticate: '/account/sign-in',
  register: '/account/register',
  recoverPassword: '/account/recover-password',
  unlockAccount: '/account/unlock',
};

export function buildIdxJourneyUrl(
  flow: IdxJourneyFlow,
  returnTo: string,
): string {
  const searchParams = new URLSearchParams({ returnTo });
  return `${idxJourneyPaths[flow]}?${searchParams.toString()}`;
}

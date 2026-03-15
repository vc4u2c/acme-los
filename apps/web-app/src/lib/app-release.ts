import { createAppReleaseInfo } from '@acme-los/core/config';

export const webAppRelease = createAppReleaseInfo(
  'web',
  process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
);

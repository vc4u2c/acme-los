import { createAppReleaseInfo } from '@acme-los/core/config';

export const webAppRelease = createAppReleaseInfo(
  'web',
  process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  process.env.NEXT_PUBLIC_APP_BUILD ?? process.env.APP_BUILD_ID,
  process.env.APP_ENVIRONMENT_NAME ??
    process.env.NEXT_PUBLIC_APP_ENVIRONMENT ??
    'local',
);

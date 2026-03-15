import { createAppReleaseInfo } from '@acme-los/core/config';
import Constants from 'expo-constants';

export const mobileAppRelease = createAppReleaseInfo(
  'mobile',
  (Constants.expoConfig?.extra?.appVersion as string | undefined) ??
    Constants.expoConfig?.version ??
    '0.0.0',
);

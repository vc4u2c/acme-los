import { createAppReleaseInfo } from '@acme-los/core/config';
import Constants from 'expo-constants';

type ExpoManifestLike = {
  extra?: {
    appVersion?: string;
    expoClient?: {
      extra?: {
        appVersion?: string;
      };
      version?: string;
    };
  };
  version?: string;
} | null;

function resolveMobileAppVersion(): string {
  if (process.env.EXPO_PUBLIC_APP_VERSION) {
    return process.env.EXPO_PUBLIC_APP_VERSION;
  }

  const expoConfigVersion =
    (Constants.expoConfig?.extra?.appVersion as string | undefined) ??
    Constants.expoConfig?.version;

  if (expoConfigVersion) {
    return expoConfigVersion;
  }

  const manifest = Constants.manifest as ExpoManifestLike;
  const manifestVersion =
    manifest?.extra?.appVersion ??
    manifest?.extra?.expoClient?.extra?.appVersion ??
    manifest?.extra?.expoClient?.version ??
    manifest?.version;

  if (manifestVersion) {
    return manifestVersion;
  }

  return '0.0.0';
}

export const mobileAppRelease = createAppReleaseInfo(
  'mobile',
  resolveMobileAppVersion(),
);

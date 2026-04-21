import { createAppReleaseInfo } from '@acme-los/core/config';
import Constants from 'expo-constants';

type ExpoManifestLike = {
  extra?: {
    appBuild?: string;
    appEnvironment?: string;
    appVersion?: string;
    expoClient?: {
      extra?: {
        appBuild?: string;
        appEnvironment?: string;
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

function resolveMobileAppEnvironmentName(): string {
  if (process.env.EXPO_PUBLIC_APP_ENVIRONMENT) {
    return process.env.EXPO_PUBLIC_APP_ENVIRONMENT;
  }

  const expoConfigEnvironment =
    (Constants.expoConfig?.extra?.appEnvironment as string | undefined) ??
    (Constants.manifest as ExpoManifestLike)?.extra?.appEnvironment;

  if (expoConfigEnvironment) {
    return expoConfigEnvironment;
  }

  return 'local';
}

function resolveMobileAppBuildId(): string | undefined {
  if (process.env.EXPO_PUBLIC_APP_BUILD) {
    return process.env.EXPO_PUBLIC_APP_BUILD;
  }

  const expoConfigBuildId =
    (Constants.expoConfig?.extra?.appBuild as string | undefined) ??
    ((Constants.manifest as ExpoManifestLike)?.extra?.appBuild as
      | string
      | undefined);

  return expoConfigBuildId;
}

export const mobileAppRelease = createAppReleaseInfo(
  'mobile',
  resolveMobileAppVersion(),
  resolveMobileAppBuildId(),
  resolveMobileAppEnvironmentName(),
);

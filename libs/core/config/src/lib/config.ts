export interface AppRuntimeConfig {
  environment: 'development' | 'test' | 'production';
  apiBaseUrl: string;
  enableMockData: boolean;
}

export type AppReleaseTarget = 'web' | 'mobile';

export interface AppReleaseInfo {
  target: AppReleaseTarget;
  name: string;
  version: string;
  versionBadgeLabel: string;
}

const releaseTargetNames: Record<AppReleaseTarget, string> = {
  web: 'Web App',
  mobile: 'Mobile App',
};

export function getDefaultRuntimeConfig(): AppRuntimeConfig {
  return {
    environment: 'development',
    apiBaseUrl: 'http://localhost:3000/api',
    enableMockData: true,
  };
}

export function createAppReleaseInfo(
  target: AppReleaseTarget,
  version: string,
): AppReleaseInfo {
  const name = releaseTargetNames[target];

  return {
    target,
    name,
    version,
    versionBadgeLabel: `${name} v${version}`,
  };
}

export interface AppRuntimeConfig {
  environment: 'development' | 'test' | 'production';
  apiBaseUrl: string;
  enableMockData: boolean;
}

export type AppReleaseTarget = 'web' | 'mobile';
export type AppEnvironmentName =
  | 'local'
  | 'dev'
  | 'qa'
  | 'test'
  | 'stg'
  | 'prod'
  | 'sandbox'
  | 'unknown';

export interface AppReleaseInfo {
  target: AppReleaseTarget;
  name: string;
  version: string;
  versionBadgeLabel: string;
  environmentName: AppEnvironmentName;
  environmentBadgeLabel: string;
}

const releaseTargetNames: Record<AppReleaseTarget, string> = {
  web: 'Web App',
  mobile: 'Mobile App',
};

const appEnvironmentAliases: Record<string, AppEnvironmentName> = {
  local: 'local',
  localhost: 'local',
  dev: 'dev',
  development: 'dev',
  qa: 'qa',
  test: 'test',
  testing: 'test',
  stage: 'stg',
  staging: 'stg',
  stg: 'stg',
  prod: 'prod',
  production: 'prod',
  sandbox: 'sandbox',
};

const appEnvironmentLabels: Record<AppEnvironmentName, string> = {
  local: 'Local',
  dev: 'Dev',
  qa: 'QA',
  test: 'Test',
  stg: 'Stg',
  prod: 'Prod',
  sandbox: 'Sandbox',
  unknown: 'Unknown',
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
  environmentName?: string | null,
): AppReleaseInfo {
  const name = releaseTargetNames[target];
  const normalizedEnvironmentName =
    resolveAppEnvironmentName(environmentName) ?? 'local';

  return {
    target,
    name,
    version,
    versionBadgeLabel: `${name} v${version}`,
    environmentName: normalizedEnvironmentName,
    environmentBadgeLabel: formatAppEnvironmentLabel(normalizedEnvironmentName),
  };
}

export function resolveAppEnvironmentName(
  value?: string | null,
): AppEnvironmentName | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return undefined;
  }

  return appEnvironmentAliases[normalizedValue] ?? 'unknown';
}

export function formatAppEnvironmentLabel(value?: string | null): string {
  const normalizedEnvironmentName = resolveAppEnvironmentName(value) ?? 'local';
  return appEnvironmentLabels[normalizedEnvironmentName] ?? 'Unknown';
}

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
  buildId?: string;
  buildBadgeLabel?: string;
  showBuildBadge: boolean;
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
  buildId?: string | null,
  environmentName?: string | null,
): AppReleaseInfo {
  const name = releaseTargetNames[target];
  const normalizedEnvironmentName =
    resolveAppEnvironmentName(environmentName) ?? 'local';
  const normalizedBuildId = normalizeAppBuildId(buildId);
  const showBuildBadge =
    Boolean(normalizedBuildId) &&
    normalizedEnvironmentName !== 'prod' &&
    normalizedEnvironmentName !== 'unknown';

  return {
    target,
    name,
    version,
    versionBadgeLabel: `${name} v${version}`,
    buildId: normalizedBuildId,
    buildBadgeLabel: showBuildBadge ? `Build ${normalizedBuildId}` : undefined,
    showBuildBadge,
    environmentName: normalizedEnvironmentName,
    environmentBadgeLabel: formatAppEnvironmentLabel(normalizedEnvironmentName),
  };
}

export function normalizeAppBuildId(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  const shaWithOptionalSuffixMatch = normalizedValue.match(
    /^([0-9a-f]{7,40})(?:-[a-z0-9._-]+)?$/i,
  );
  if (shaWithOptionalSuffixMatch?.[1]) {
    return shaWithOptionalSuffixMatch[1].slice(0, 8).toLowerCase();
  }

  if (/^[0-9a-f]{7,40}$/i.test(normalizedValue)) {
    return normalizedValue.slice(0, 8).toLowerCase();
  }

  return normalizedValue.length > 24
    ? normalizedValue.slice(0, 24)
    : normalizedValue;
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

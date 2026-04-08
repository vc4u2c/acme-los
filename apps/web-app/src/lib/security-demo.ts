import { resolveAppEnvironmentName } from '@acme-los/core/config';

function getSecurityInspectorOverride(): boolean | undefined {
  const configuredValue = process.env.ACME_ENABLE_SECURITY_INSPECTOR?.trim();

  if (!configuredValue) {
    return undefined;
  }

  if (configuredValue === 'true') {
    return true;
  }

  if (configuredValue === 'false') {
    return false;
  }

  return undefined;
}

export function isSecurityInspectorEnabled(): boolean {
  const override = getSecurityInspectorOverride();
  if (override !== undefined) {
    return override;
  }

  const appEnvironmentName = resolveAppEnvironmentName(
    process.env.APP_ENVIRONMENT_NAME ?? process.env.NEXT_PUBLIC_APP_ENVIRONMENT,
  );

  return appEnvironmentName === 'local' || appEnvironmentName === 'dev';
}

import type { WebAuthSessionTiming } from '@acme-los/api/contracts';

export type WebSessionTimeoutConfig = {
  idleTimeoutSeconds: number;
  warningSeconds: number;
  absoluteTimeoutSeconds?: number;
};

const TEST_FRIENDLY_ENVIRONMENTS = new Set(['local', 'dev', 'development']);
const DEFAULT_TEST_IDLE_TIMEOUT_SECONDS = 2 * 60;
const DEFAULT_TEST_WARNING_SECONDS = 30;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 15 * 60;
const DEFAULT_WARNING_SECONDS = 2 * 60;

function getCurrentEnvironmentName(): string {
  return (
    process.env.APP_ENVIRONMENT_NAME?.trim().toLowerCase() ||
    process.env.NEXT_PUBLIC_APP_ENVIRONMENT?.trim().toLowerCase() ||
    (process.env.NODE_ENV === 'production' ? 'prod' : 'local')
  );
}

function readIntegerEnvironmentValue(
  name: string,
  options: { minimum: number },
): number | undefined {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < options.minimum ||
    !Number.isSafeInteger(parsedValue)
  ) {
    throw new Error(
      `${name} must be an integer greater than or equal to ${options.minimum}.`,
    );
  }

  return parsedValue;
}

export function getWebSessionTimeoutConfig(): WebSessionTimeoutConfig {
  const isTestFriendlyEnvironment = TEST_FRIENDLY_ENVIRONMENTS.has(
    getCurrentEnvironmentName(),
  );
  const defaultIdleTimeoutSeconds = isTestFriendlyEnvironment
    ? DEFAULT_TEST_IDLE_TIMEOUT_SECONDS
    : DEFAULT_IDLE_TIMEOUT_SECONDS;
  const defaultWarningSeconds = isTestFriendlyEnvironment
    ? DEFAULT_TEST_WARNING_SECONDS
    : DEFAULT_WARNING_SECONDS;
  const idleTimeoutSeconds =
    readIntegerEnvironmentValue('ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS', {
      minimum: 1,
    }) ?? defaultIdleTimeoutSeconds;
  const requestedWarningSeconds =
    readIntegerEnvironmentValue('ACME_WEB_SESSION_WARNING_SECONDS', {
      minimum: 0,
    }) ?? defaultWarningSeconds;
  const warningSeconds = Math.min(
    requestedWarningSeconds,
    Math.max(idleTimeoutSeconds - 1, 0),
  );
  const absoluteTimeoutSeconds = readIntegerEnvironmentValue(
    'ACME_WEB_SESSION_ABSOLUTE_TIMEOUT_SECONDS',
    {
      minimum: 1,
    },
  );

  return {
    idleTimeoutSeconds,
    warningSeconds,
    ...(absoluteTimeoutSeconds ? { absoluteTimeoutSeconds } : {}),
  };
}

export function resolveAbsoluteSessionExpiresAt(
  tokenExpiresAt: number,
  currentEpochSeconds = Math.floor(Date.now() / 1000),
): number {
  const { absoluteTimeoutSeconds } = getWebSessionTimeoutConfig();

  if (!absoluteTimeoutSeconds) {
    return tokenExpiresAt;
  }

  return Math.min(tokenExpiresAt, currentEpochSeconds + absoluteTimeoutSeconds);
}

export function buildWebAuthSessionTiming({
  absoluteExpiresAt,
  idleExpiresAt,
  stepUp,
}: {
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  stepUp?: WebAuthSessionTiming['stepUp'];
}): WebAuthSessionTiming {
  const { idleTimeoutSeconds, warningSeconds } = getWebSessionTimeoutConfig();

  return {
    absoluteExpiresAt,
    idleExpiresAt,
    idleTimeoutSeconds,
    warningSeconds,
    ...(stepUp ? { stepUp } : {}),
  };
}

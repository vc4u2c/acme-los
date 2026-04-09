import { logs, SeverityNumber } from '@opentelemetry/api-logs';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function sanitizeAttributeValue(value: unknown): string | number | boolean {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (value === null || typeof value === 'undefined') {
    return '';
  }

  return JSON.stringify(value);
}

function getSeverityNumber(level: LogLevel): SeverityNumber {
  switch (level) {
    case 'debug':
      return SeverityNumber.DEBUG;
    case 'info':
      return SeverityNumber.INFO;
    case 'warn':
      return SeverityNumber.WARN;
    case 'error':
      return SeverityNumber.ERROR;
  }
}

function emitOpenTelemetryLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  try {
    const logger = logs.getLogger('acme-los.app');

    logger.emit({
      severityNumber: getSeverityNumber(level),
      severityText: level.toUpperCase(),
      body: message,
      attributes: Object.fromEntries(
        Object.entries(context ?? {}).map(([key, value]) => [
          key,
          sanitizeAttributeValue(value),
        ]),
      ),
    });
  } catch {
    // Never let telemetry emission break the app logger path.
  }
}

function writeLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const payload = {
    level,
    message,
    ...context,
  };

  console[level](JSON.stringify(payload));
  emitOpenTelemetryLog(level, message, context);
}

export function createConsoleLogger(): Logger {
  return {
    debug: (message, context) => writeLog('debug', message, context),
    info: (message, context) => writeLog('info', message, context),
    warn: (message, context) => writeLog('warn', message, context),
    error: (message, context) => writeLog('error', message, context),
  };
}

import { logs, SeverityNumber } from '@opentelemetry/api-logs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export type TraceLogContext = LogContext & {
  correlationId?: string;
  event?: string;
  route?: string;
  traceId?: string;
  traceFlags?: string;
  incomingTraceparent?: string;
  traceparent?: string;
  spanId?: string;
  parentSpanId?: string;
};

type RuntimeLogContext = {
  application: string;
  service: string;
  environment: string;
  nodeEnv: string;
  version?: string;
  build?: string;
};

export interface TraceLogger {
  log(level: LogLevel, message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  event(
    level: LogLevel,
    eventName: string,
    message: string,
    context?: LogContext,
  ): void;
}

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
  context?: LogContext,
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

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRuntimeLogContext(): RuntimeLogContext {
  return {
    application: 'acme-los',
    service:
      readTrimmedEnv('OTEL_SERVICE_NAME') ??
      readTrimmedEnv('APP_SERVICE_NAME') ??
      'web-app',
    environment:
      readTrimmedEnv('APP_ENVIRONMENT_NAME') ??
      readTrimmedEnv('NEXT_PUBLIC_APP_ENVIRONMENT') ??
      (process.env['NODE_ENV'] === 'production' ? 'production' : 'local'),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    version: readTrimmedEnv('NEXT_PUBLIC_APP_VERSION'),
    build:
      readTrimmedEnv('APP_BUILD_ID') ?? readTrimmedEnv('NEXT_PUBLIC_APP_BUILD'),
  };
}

function writeLog(
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  const emit = (): void => {
    try {
      const logContext = {
        ...context,
        ...getRuntimeLogContext(),
      };
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...logContext,
      };

      console[level](JSON.stringify(payload));
      emitOpenTelemetryLog(level, message, logContext);
    } catch {
      try {
        console[level](
          JSON.stringify({
            level,
            message: 'Logger emission failed.',
            originalMessage: message,
          }),
        );
      } catch {
        // Logging must never break the application path.
      }
    }
  };

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(emit);
    return;
  }

  setTimeout(emit, 0);
}

export function createConsoleLogger(): Logger {
  return {
    debug: (message, context) => writeLog('debug', message, context),
    info: (message, context) => writeLog('info', message, context),
    warn: (message, context) => writeLog('warn', message, context),
    error: (message, context) => writeLog('error', message, context),
  };
}

export function createTraceLogger(
  logger: Logger,
  baseContext: TraceLogContext,
): TraceLogger {
  const emit = (
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): void => {
    logger[level](message, {
      ...baseContext,
      ...context,
    });
  };

  return {
    log: emit,
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    event: (level, eventName, message, context) =>
      emit(level, message, {
        ...context,
        event: eventName,
      }),
  };
}

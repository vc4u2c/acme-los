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
  event?: string;
  route?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
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

function writeLog(
  level: LogLevel,
  message: string,
  context?: LogContext,
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

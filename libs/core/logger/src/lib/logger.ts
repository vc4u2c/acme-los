export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function writeLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  const payload = {
    level,
    message,
    ...context,
  };

  console[level](JSON.stringify(payload));
}

export function createConsoleLogger(): Logger {
  return {
    debug: (message, context) => writeLog('debug', message, context),
    info: (message, context) => writeLog('info', message, context),
    warn: (message, context) => writeLog('warn', message, context),
    error: (message, context) => writeLog('error', message, context),
  };
}

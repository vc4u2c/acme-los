export type BrowserLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BrowserTelemetry = {
  emittedAt: string;
  pageUrl: string;
  referrer?: string;
  userAgent: string;
  language: string;
  languages: string[];
  timeZone: string;
  visibilityState: DocumentVisibilityState;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelRatio: number;
  };
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
};

type NetworkInformation = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

type NavigatorWithTelemetry = Navigator & {
  connection?: NetworkInformation;
  deviceMemory?: number;
};

export type BrowserTraceLogger = {
  log(
    level: BrowserLogLevel,
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  debug(
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  info(
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  warn(
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  error(
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
};

export function collectBrowserTelemetry(): BrowserTelemetry {
  const navigatorWithTelemetry = navigator as NavigatorWithTelemetry;
  const connection = navigatorWithTelemetry.connection;

  return {
    emittedAt: new Date().toISOString(),
    pageUrl: `${window.location.origin}${window.location.pathname}`,
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: Array.from(navigator.languages ?? []),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibilityState: document.visibilityState,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigatorWithTelemetry.deviceMemory,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
    },
    connection: connection
      ? {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        }
      : undefined,
  };
}

export function createBrowserTraceLogger({
  traceId,
  route,
}: {
  traceId: string;
  route: string;
}): BrowserTraceLogger {
  const emit = (
    level: BrowserLogLevel,
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    console[level](
      JSON.stringify({
        level,
        message,
        event: eventName,
        traceId,
        route,
        ...context,
      }),
    );
  };

  return {
    log: emit,
    debug: (eventName, message, context) =>
      emit('debug', eventName, message, context),
    info: (eventName, message, context) =>
      emit('info', eventName, message, context),
    warn: (eventName, message, context) =>
      emit('warn', eventName, message, context),
    error: (eventName, message, context) =>
      emit('error', eventName, message, context),
  };
}

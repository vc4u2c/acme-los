import {
  correlationIdHeaderName,
  createTraceparentHeader,
  traceparentHeaderName,
} from '@acme-los/core/logger/trace-context';

export type BrowserLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BrowserTraceContext = {
  correlationId: string;
  traceId: string;
  spanId: string;
  traceparent: string;
};

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

export type BrowserErrorTelemetry = {
  name: string;
  message: string;
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

export type BrowserLogScope = {
  headers: Record<string, string>;
  logger: BrowserTraceLogger;
  route: string;
  traceContext: BrowserTraceContext;
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

function createRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);

  do {
    crypto.getRandomValues(bytes);
  } while (bytes.every((byte) => byte === 0));

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function createBrowserTraceContext(): BrowserTraceContext {
  const traceId = createRandomHex(16);
  const spanId = createRandomHex(8);

  return {
    correlationId: crypto.randomUUID(),
    traceId,
    spanId,
    traceparent: createTraceparentHeader({
      traceId,
      spanId,
      traceFlags: '01',
    }),
  };
}

export function createBrowserTraceHeaders(
  traceContext: BrowserTraceContext,
): Record<string, string> {
  return {
    [correlationIdHeaderName]: traceContext.correlationId,
    [traceparentHeaderName]: traceContext.traceparent,
  };
}

export function serializeBrowserError(error: unknown): BrowserErrorTelemetry {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: 'Error',
    message: 'Unknown browser error.',
  };
}

export function createBrowserLogScope({
  route,
}: {
  route: string;
}): BrowserLogScope {
  const traceContext = createBrowserTraceContext();

  return {
    headers: createBrowserTraceHeaders(traceContext),
    logger: createBrowserTraceLogger({ route, traceContext }),
    route,
    traceContext,
  };
}

export function createBrowserTraceLogger({
  traceContext,
  route,
}: {
  traceContext: BrowserTraceContext;
  route: string;
}): BrowserTraceLogger {
  const emit = (
    level: BrowserLogLevel,
    eventName: string,
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    const write = (): void => {
      console[level](
        JSON.stringify({
          level,
          message,
          correlationId: traceContext.correlationId,
          event: eventName,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          traceparent: traceContext.traceparent,
          route,
          ...context,
        }),
      );
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(write);
      return;
    }

    window.setTimeout(write, 0);
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

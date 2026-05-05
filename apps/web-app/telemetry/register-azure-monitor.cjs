'use strict';

let telemetryStarted = false;

function resolveEnvironmentName() {
  const value = process.env.APP_ENVIRONMENT_NAME;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : process.env.NODE_ENV || 'unknown';
}

function shouldIgnoreIncomingRequest(request) {
  const method =
    typeof request?.method === 'string' ? request.method.toUpperCase() : '';
  const url = typeof request?.url === 'string' ? request.url : '';

  return (
    method === 'OPTIONS' ||
    url === '/api/health' ||
    url.startsWith('/api/health?') ||
    url === '/api/health/live' ||
    url.startsWith('/api/health/live?')
  );
}

function registerAzureMonitor() {
  if (telemetryStarted) {
    return;
  }

  const connectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();

  if (!connectionString) {
    console.info(
      '[telemetry] Azure Monitor disabled because APPLICATIONINSIGHTS_CONNECTION_STRING is not set.',
    );
    return;
  }

  let useAzureMonitor;

  try {
    ({ useAzureMonitor } = require('@azure/monitor-opentelemetry'));
  } catch (error) {
    console.warn(
      `[telemetry] Azure Monitor preload skipped because the runtime dependency could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString,
    },
    enableLiveMetrics: resolveEnvironmentName() === 'prod',
    enablePerformanceCounters: false,
    enableStandardMetrics: true,
    enableTraceBasedSamplingForLogs: true,
    browserSdkLoaderOptions: {
      enabled: false,
      connectionString: '',
    },
    instrumentationOptions: {
      azureSdk: { enabled: true },
      http: {
        enabled: true,
        ignoreIncomingRequestHook: shouldIgnoreIncomingRequest,
      },
      mongoDb: { enabled: false },
      mySql: { enabled: false },
      postgreSql: { enabled: false },
      redis: { enabled: false },
      redis4: { enabled: true },
      bunyan: { enabled: false },
      winston: { enabled: false },
    },
  });

  telemetryStarted = true;
  console.info(
    `[telemetry] Azure Monitor enabled for ${resolveEnvironmentName()}.`,
  );
}

registerAzureMonitor();

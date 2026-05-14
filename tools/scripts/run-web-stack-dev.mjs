import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';
const passthroughArgs = process.argv.slice(2);
const redisUrl = process.env.ACME_REDIS_URL || 'redis://127.0.0.1:6379';
const bffBaseUrl =
  process.env.ACME_DEV_STACK_BFF_BASE_URL || 'http://localhost:5186';
const trustedProxySecret =
  process.env.ACME_BFF_TRUSTED_PROXY_SECRET ||
  'acme-los-local-dev-bff-proxy-secret';
const bffObservabilityEventsEnabled =
  process.env.ACME_BFF_OBSERVABILITY_EVENTS_ENABLED || 'true';
const children = new Set();
let shuttingDown = false;

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    ...options,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });

  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });

  return child;
}

function stopChildren() {
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

function fail(message, exitCode = 1) {
  console.error(message);
  stopChildren();
  process.exit(exitCode);
}

const redis = spawnProcess('docker', [
  'compose',
  '-f',
  'tools/docker/dev-services.yml',
  'up',
  '-d',
  'redis',
]);

redis.once('exit', (code) => {
  if (code !== 0) {
    fail(`Redis failed to start with exit code ${code ?? 1}.`, code ?? 1);
    return;
  }

  const bff = spawnProcess(
    'dotnet',
    [
      'run',
      '--project',
      'apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj',
      '--no-launch-profile',
      '--',
      '--urls',
      bffBaseUrl,
    ],
    {
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        DOTNET_ENVIRONMENT: 'Development',
        ACME_WEB_STATE_STORE: process.env.ACME_WEB_STATE_STORE || 'redis',
        ACME_REDIS_URL: redisUrl,
        ACME_BFF_TRUSTED_PROXY_SECRET: trustedProxySecret,
        ACME_BFF_OBSERVABILITY_EVENTS_ENABLED: bffObservabilityEventsEnabled,
      },
    },
  );

  const web = spawnProcess(
    npxCommand,
    ['nx', 'run', 'web-app:dev', ...passthroughArgs],
    {
      env: {
        ACME_BFF_BASE_URL: bffBaseUrl,
        ACME_BFF_PROXY_MODE: 'bff',
        ACME_BFF_TRUSTED_PROXY_SECRET: trustedProxySecret,
        ACME_BFF_OBSERVABILITY_EVENTS_ENABLED: bffObservabilityEventsEnabled,
        ACME_WEB_STATE_STORE: process.env.ACME_WEB_STATE_STORE || 'redis',
        ACME_REDIS_URL: redisUrl,
      },
    },
  );

  console.log('');
  console.log('ACME LOS local stack is starting.');
  console.log('Web app: http://localhost:3000');
  console.log(`BFF proxy target: ${bffBaseUrl}`);
  console.log(`BFF direct endpoint: ${bffBaseUrl}`);
  console.log(`Redis: ${redisUrl}`);
  console.log('');

  for (const child of [bff, web]) {
    child.once('exit', (childCode, signal) => {
      if (shuttingDown) {
        return;
      }

      if (signal) {
        stopChildren();
        process.exit(0);
      }

      stopChildren();
      process.exit(childCode ?? 0);
    });
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exit(0);
  });
}

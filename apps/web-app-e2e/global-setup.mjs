import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const statePath = join(
  workspaceRoot,
  'node_modules',
  '.cache',
  'acme-los',
  'web-app-e2e-server.json',
);

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4200';
const enableBffProxyE2E = process.env.ACME_E2E_ENABLE_BFF === '1';
const bffBaseURL = process.env.ACME_E2E_BFF_BASE_URL || 'http://127.0.0.1:7206';
const sharedWebSessionSecret =
  process.env.ACME_WEB_SESSION_SECRET || 'acme-los-web-e2e-session-secret';
const trustedBffProxySecret =
  process.env.ACME_BFF_TRUSTED_PROXY_SECRET || 'acme-los-bff-e2e-proxy-secret';

function writeState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function isUrlAvailable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    });

    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForUrl(url, name, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isUrlAvailable(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`${name} did not become available at ${url}.`);
}

function startProcess(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    detached: true,
    env,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });

  if (!child.pid) {
    throw new Error(`Failed to start ${name}.`);
  }

  child.unref();
  return { name, pid: child.pid };
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // The process may have exited between the readiness check and teardown.
  }
}

function cleanupStartedProcesses(processes) {
  for (const managedProcess of processes.toReversed()) {
    killProcessTree(managedProcess.pid);
  }
}

export default async function globalSetup() {
  const startedProcesses = [];

  if (existsSync(statePath)) {
    rmSync(statePath, { force: true });
  }

  if (await isUrlAvailable(baseURL)) {
    writeState({ managed: false, processes: [] });
    return;
  }

  try {
    if (enableBffProxyE2E && !(await isUrlAvailable(bffBaseURL))) {
      startedProcesses.push(
        startProcess(
          'bff-api',
          'dotnet',
          [
            'run',
            '--project',
            'apps/bff-api/src/Acme.Los.Bff.Api/Acme.Los.Bff.Api.csproj',
            `--urls=${bffBaseURL}`,
          ],
          {
            ...process.env,
            ACME_WEB_SESSION_SECRET: sharedWebSessionSecret,
            ACME_BFF_TRUSTED_PROXY_SECRET: trustedBffProxySecret,
            ASPNETCORE_ENVIRONMENT: 'Development',
          },
        ),
      );

      await waitForUrl(bffBaseURL, 'BFF API');
    }

    startedProcesses.push(
      startProcess(
        'web-app',
        process.execPath,
        ['tools/scripts/run-web-e2e-server.mjs'],
        {
          ...process.env,
          ACME_AUTH_PROVIDER: 'mock',
          ACME_ENABLE_SECURITY_INSPECTOR: 'true',
          ACME_WEB_SESSION_SECRET: sharedWebSessionSecret,
          HOSTNAME: '127.0.0.1',
          NEXT_PUBLIC_AUTH_PROVIDER: 'mock',
          PORT: '4200',
          ...(enableBffProxyE2E
            ? {
                ACME_BFF_BASE_URL: bffBaseURL,
                ACME_BFF_TRUSTED_PROXY_SECRET: trustedBffProxySecret,
              }
            : {}),
        },
      ),
    );

    await waitForUrl(baseURL, 'web app');
    writeState({ managed: true, processes: startedProcesses });
  } catch (error) {
    cleanupStartedProcesses(startedProcesses);
    throw error;
  }
}

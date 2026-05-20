import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
    // The process may already be gone.
  }
}

export default async function globalTeardown() {
  if (!existsSync(statePath)) {
    return;
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));

  if (state.managed) {
    for (const managedProcess of state.processes.toReversed()) {
      killProcessTree(managedProcess.pid);
    }
  }

  rmSync(statePath, { force: true });
}

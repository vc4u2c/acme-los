import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
let port = 4200;

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--port' && args[index + 1]) {
    port = Number.parseInt(args[index + 1], 10);
    index += 1;
  }
}

const appDir = process.cwd();
const nextCliPath = resolve(appDir, '../../node_modules/next/dist/bin/next');
const nextLockPath = resolve(appDir, '.next/lock');
const nextDevLockPath = resolve(appDir, '.next/dev/lock');

for (const lockPath of [nextLockPath, nextDevLockPath]) {
  if (existsSync(lockPath)) {
    rmSync(lockPath, { force: true });
  }
}

const buildResult = spawnSync(process.execPath, [nextCliPath, 'build'], {
  cwd: appDir,
  stdio: 'inherit',
  env: process.env,
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const serverProcess = spawn(
  process.execPath,
  [nextCliPath, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: appDir,
    stdio: 'inherit',
    env: process.env,
  },
);

const shutdown = (signal) => {
  if (!serverProcess.killed) {
    serverProcess.kill(signal);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

serverProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

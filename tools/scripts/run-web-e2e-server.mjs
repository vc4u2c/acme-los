import { spawn } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..', '..');
const webAppRoot = join(workspaceRoot, 'apps', 'web-app');
const nextCli = join(
  workspaceRoot,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next',
);

function run(command, args, options) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', rejectProcess);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }

      rejectProcess(
        new Error(
          signal
            ? `${command} ${args.join(' ')} exited after ${signal}`
            : `${command} ${args.join(' ')} exited with code ${code}`,
        ),
      );
    });
  });
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) {
    return;
  }

  rmSync(destination, { force: true, recursive: true });
  cpSync(source, destination, { recursive: true });
}

await run(process.execPath, [nextCli, 'build'], {
  cwd: webAppRoot,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  },
});

const standaloneWebAppRoot = join(
  webAppRoot,
  '.next',
  'standalone',
  'apps',
  'web-app',
);
const standaloneServer = join(standaloneWebAppRoot, 'server.js');

if (!existsSync(standaloneServer)) {
  throw new Error(
    `Next standalone server was not generated: ${standaloneServer}`,
  );
}

copyDirectory(
  join(webAppRoot, '.next', 'static'),
  join(standaloneWebAppRoot, '.next', 'static'),
);
copyDirectory(join(webAppRoot, 'public'), join(standaloneWebAppRoot, 'public'));

const server = spawn(process.execPath, [standaloneServer], {
  cwd: standaloneWebAppRoot,
  env: process.env,
  shell: false,
  stdio: 'ignore',
});

let shutdownRequested = false;

function requestShutdown(signal) {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  server.kill(signal);

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    requestShutdown(signal);
  });
}

server.on('error', (error) => {
  throw error;
});

server.on('exit', (code, signal) => {
  if (shutdownRequested) {
    process.exit(0);
  }

  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});

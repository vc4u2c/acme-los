import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'npx.cmd' : 'npx';

const dockerComposeResult = spawnSync(
  'docker',
  ['compose', '-f', 'tools/docker/dev-services.yml', 'up', '-d', 'redis'],
  {
    stdio: 'inherit',
    shell: isWindows,
  },
);

if (dockerComposeResult.status !== 0) {
  process.exit(dockerComposeResult.status ?? 1);
}

const webAppDevResult = spawnSync(command, ['nx', 'run', 'web-app:dev'], {
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    ACME_WEB_STATE_STORE: process.env.ACME_WEB_STATE_STORE || 'redis',
    ACME_REDIS_URL: process.env.ACME_REDIS_URL || 'redis://127.0.0.1:6379',
  },
});

process.exit(webAppDevResult.status ?? 0);

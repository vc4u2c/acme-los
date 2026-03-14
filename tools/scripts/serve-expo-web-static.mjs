import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
let port = 4201;
let outputDir;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '--port' && args[index + 1]) {
    port = Number.parseInt(args[index + 1], 10);
    index += 1;
    continue;
  }

  if (!arg.startsWith('--')) {
    outputDir = arg;
  }
}
const appDir = process.cwd();
const expoCliPath = resolve(appDir, '../../node_modules/expo/bin/cli');
const exportDir = outputDir
  ? resolve(appDir, outputDir)
  : mkdtempSync(join(tmpdir(), 'acme-los-mobile-e2e-'));
const exportArg = outputDir ?? exportDir;

if (outputDir) {
  rmSync(exportDir, { recursive: true, force: true });
}

const exportResult = spawnSync(
  process.execPath,
  [expoCliPath, 'export', '--platform', 'web', '--output-dir', exportArg],
  {
    cwd: appDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: process.env.CI ?? '1',
    },
  },
);

if (exportResult.status !== 0) {
  process.exit(exportResult.status ?? 1);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  const requestPath = request.url?.split('?')[0] ?? '/';
  const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(
    exportDir,
    normalizedPath === '/' ? 'index.html' : normalizedPath,
  );

  if (!existsSync(filePath)) {
    filePath = join(exportDir, 'index.html');
  } else if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });

  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `Serving Expo web export from ${exportDir} on http://127.0.0.1:${port}`,
  );
});

const shutdown = () => {
  server.close(() => {
    rmSync(exportDir, { recursive: true, force: true });
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

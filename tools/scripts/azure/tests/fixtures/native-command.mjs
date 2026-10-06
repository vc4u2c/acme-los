const mode = process.argv[2];
if (mode === 'stderr') {
  process.stderr.write('synthetic-secret-from-provider');
  process.exitCode = 1;
} else if (mode === 'malformed') {
  process.stdout.write('synthetic-secret-from-provider: invalid JSON');
} else if (mode === 'failure') {
  process.exitCode = 1;
} else if (mode === 'progress') {
  process.stderr.write('Running ...\rFinished\n');
  process.stdout.write('{"status":"ok"}');
} else if (mode === 'missing') {
  process.stderr.write('(ResourceNotFound) Synthetic missing resource');
  process.exitCode = 1;
} else if (mode === 'stack-missing' || mode === 'stack-resource-missing') {
  const code =
    mode === 'stack-missing'
      ? 'DeploymentStackNotFound'
      : 'DeploymentStackResourceNotFound';
  process.stderr.write(`(${code}) Synthetic missing stack`);
  process.exitCode = 1;
} else {
  process.stdout.write('{"status":"ok"}');
}

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..', '..', '..');
const registryPath =
  '.agents/skills/documentation-lookup/references/authoritative-sources.json';
const supportedVersionKinds = new Set([
  'npm',
  'nuget',
  'package-manager',
  'repository-policy',
  'target-framework',
  'text',
]);
const supportedModels = new Set([
  'copied-source',
  'lts',
  'sdk-train',
  'service',
  'stable',
]);
const supportedReleaseResolutions = new Set([
  'exact-tag',
  'local-first',
  'package-release',
  'sdk-release',
]);

function absolute(relativePath) {
  const resolvedPath = path.resolve(root, relativePath);
  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path resolves outside the repository: ${relativePath}`);
  }

  return resolvedPath;
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8');
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveVersion(source) {
  const versionSource = source.versionSource;

  if (versionSource.kind === 'text') {
    return (await read(versionSource.path)).trim();
  }

  if (versionSource.kind === 'package-manager') {
    const manifest = JSON.parse(await read(versionSource.path));
    return manifest.packageManager ?? 'not declared';
  }

  if (versionSource.kind === 'npm') {
    const lock = JSON.parse(await read(versionSource.path));
    return (
      lock.packages?.[`node_modules/${versionSource.package}`]?.version ??
      'not resolved'
    );
  }

  if (versionSource.kind === 'nuget') {
    const centralPackages = await read(versionSource.path);
    const packagePattern = new RegExp(
      `<PackageVersion\\s+Include=["']${escapeRegExp(versionSource.package)}["']\\s+Version=["']([^"']+)["']\\s*/>`,
      'i',
    );
    return centralPackages.match(packagePattern)?.[1] ?? 'not resolved';
  }

  if (versionSource.kind === 'target-framework') {
    const project = await read(versionSource.path);
    return (
      project.match(/<TargetFramework>([^<]+)<\/TargetFramework>/i)?.[1] ??
      'not resolved'
    );
  }

  return 'repository managed';
}

async function validateRegistry(registry) {
  const failures = [];
  const ids = new Set();

  if (registry.schemaVersion !== 1) {
    failures.push('schemaVersion must be 1');
  }

  if (!Array.isArray(registry.sources) || registry.sources.length === 0) {
    failures.push('sources must be a non-empty array');
    return failures;
  }

  for (const source of registry.sources) {
    const label = source.id || '<missing id>';

    if (!source.id || ids.has(source.id)) {
      failures.push(`${label}: id must be present and unique`);
    }
    ids.add(source.id);

    if (!source.displayName || !source.scope) {
      failures.push(`${label}: displayName and scope are required`);
    }
    if (!supportedModels.has(source.supportModel)) {
      failures.push(`${label}: unsupported supportModel`);
    }
    if (!supportedReleaseResolutions.has(source.releaseResolution)) {
      failures.push(`${label}: unsupported releaseResolution`);
    }
    if (!source.versionSource?.path) {
      failures.push(`${label}: versionSource.path is required`);
      continue;
    }
    if (!supportedVersionKinds.has(source.versionSource.kind)) {
      failures.push(`${label}: unsupported versionSource.kind`);
    }
    if (
      ['npm', 'nuget'].includes(source.versionSource.kind) &&
      !source.versionSource.package
    ) {
      failures.push(`${label}: versionSource.package is required`);
    }

    try {
      await access(absolute(source.versionSource.path));
    } catch {
      failures.push(
        `${label}: missing version source ${source.versionSource.path}`,
      );
    }

    if (source.localPath) {
      try {
        await access(absolute(source.localPath));
      } catch {
        failures.push(`${label}: missing localPath ${source.localPath}`);
      }
    }

    if (!isHttpsUrl(source.officialDocs)) {
      failures.push(`${label}: officialDocs must be an HTTPS URL`);
    }
    if (!isHttpsUrl(source.sourceRepository)) {
      failures.push(`${label}: sourceRepository must be an HTTPS URL`);
    }
  }

  return failures;
}

const registry = JSON.parse(await read(registryPath));
const failures = await validateRegistry(registry);

if (failures.length > 0) {
  console.error('Authoritative source registry validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const rows = [];
for (const source of registry.sources) {
  rows.push({
    technology: source.displayName,
    version: await resolveVersion(source),
    model: source.supportModel,
    docs: source.officialDocs,
    source: source.sourceRepository,
  });
}

if (process.argv.includes('--check')) {
  const unresolved = rows.filter((row) => row.version === 'not resolved');
  if (unresolved.length > 0) {
    console.error(
      `Unresolved versions: ${unresolved.map((row) => row.technology).join(', ')}`,
    );
    process.exit(1);
  }

  console.log(`Validated ${rows.length} authoritative technology sources.`);
} else {
  console.table(rows);
}

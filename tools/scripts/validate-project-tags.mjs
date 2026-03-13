import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const projectFiles = [];

async function collectProjectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectProjectFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name === 'project.json') {
      projectFiles.push(fullPath);
    }
  }
}

function hasTag(tags, prefix) {
  return tags.some((tag) => tag.startsWith(prefix));
}

function validateProject(projectPath, config) {
  const errors = [];
  const relativePath = path.relative(workspaceRoot, projectPath);
  const tags = Array.isArray(config.tags) ? config.tags : [];

  if (tags.length === 0) {
    errors.push(`${relativePath}: missing tags array entries`);
    return errors;
  }

  if (relativePath.startsWith('apps\\') || relativePath.startsWith('apps/')) {
    if (!hasTag(tags, 'type:')) {
      errors.push(`${relativePath}: app projects must include a type:* tag`);
    }

    if (!hasTag(tags, 'platform:')) {
      errors.push(
        `${relativePath}: app projects must include a platform:* tag`,
      );
    }
  }

  if (relativePath.startsWith('libs\\') || relativePath.startsWith('libs/')) {
    if (!hasTag(tags, 'scope:')) {
      errors.push(
        `${relativePath}: library projects must include a scope:* tag`,
      );
    }

    if (
      (relativePath.startsWith('libs\\ui\\') ||
        relativePath.startsWith('libs/ui/')) &&
      !hasTag(tags, 'platform:')
    ) {
      errors.push(
        `${relativePath}: ui libraries must include a platform:* tag`,
      );
    }
  }

  if (tags.includes('type:e2e')) {
    const implicitDependencies = Array.isArray(config.implicitDependencies)
      ? config.implicitDependencies
      : [];

    if (implicitDependencies.length === 0) {
      errors.push(
        `${relativePath}: e2e projects must declare implicitDependencies on the app they cover`,
      );
    }
  }

  return errors;
}

await collectProjectFiles(path.join(workspaceRoot, 'apps'));
await collectProjectFiles(path.join(workspaceRoot, 'libs'));

const errors = [];

for (const projectFile of projectFiles) {
  const raw = await readFile(projectFile, 'utf8');
  const config = JSON.parse(raw);
  errors.push(...validateProject(projectFile, config));
}

if (errors.length > 0) {
  console.error('Project tag validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated project tags for ${projectFiles.length} projects.`);

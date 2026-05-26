import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

async function read(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
}

async function listSkillFolders(relativeRoot) {
  const entries = await readdir(path.join(root, relativeRoot), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function requireText(relativePath, text, expected) {
  if (!text.includes(expected)) {
    failures.push(`${relativePath}: expected "${expected}"`);
  }
}

const canonicalSkills = await listSkillFolders('.agents/skills');
const claudeSkills = await listSkillFolders('.claude/skills');

if (canonicalSkills.join('|') !== claudeSkills.join('|')) {
  failures.push(
    `Skill folders differ: canonical=[${canonicalSkills.join(', ')}], claude=[${claudeSkills.join(', ')}]`,
  );
}

for (const skill of canonicalSkills) {
  const metadataPath = `.agents/skills/${skill}/agents/openai.yaml`;
  const metadata = await read(metadataPath);
  requireText(metadataPath, metadata, 'allow_implicit_invocation: true');

  const wrapperPath = `.claude/skills/${skill}/SKILL.md`;
  const wrapper = await read(wrapperPath);
  requireText(wrapperPath, wrapper, `.agents/skills/${skill}/SKILL.md`);

  if (
    wrapper.includes('disable-model-invocation: true') ||
    wrapper.includes('user-invocable: false')
  ) {
    failures.push(
      `${wrapperPath}: current domain skills must remain automatically and explicitly invocable`,
    );
  }
}

const codexConfig = await read('.codex/config.toml');
requireText('.codex/config.toml', codexConfig, 'multi_agent = true');
requireText('.codex/config.toml', codexConfig, 'max_threads = 4');
requireText('.codex/config.toml', codexConfig, 'max_depth = 1');

const logicalRolePairs = [
  ['explorer', '.codex/agents/explorer.toml', '.claude/agents/explorer.md'],
  ['reviewer', '.codex/agents/reviewer.toml', '.claude/agents/reviewer.md'],
  [
    'docs researcher',
    '.codex/agents/docs-researcher.toml',
    '.claude/agents/docs-researcher.md',
  ],
  [
    'frontend designer',
    '.codex/agents/frontend-designer.toml',
    '.claude/agents/frontend-designer.md',
  ],
];

for (const [role, codexPath, claudePath] of logicalRolePairs) {
  const codexAgent = await read(codexPath);
  const claudeAgent = await read(claudePath);

  if (!codexAgent || !claudeAgent) {
    failures.push(`Logical role is incomplete: ${role}`);
  }
}

const implementationWorker = await read(
  '.claude/agents/implementation-worker.md',
);
requireText(
  '.claude/agents/implementation-worker.md',
  implementationWorker,
  'implementation worker',
);

if (failures.length > 0) {
  console.error('Agent system validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${canonicalSkills.length} shared skills and ${logicalRolePairs.length + 1} logical agent roles.`,
);

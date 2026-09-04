import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

async function readRequired(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
}

async function listDirectories(relativePath) {
  try {
    const entries = await readdir(path.join(root, relativePath), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    failures.push(`Missing required directory: ${relativePath}`);
    return [];
  }
}

function parseFrontmatter(relativePath, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    failures.push(`${relativePath}: missing YAML frontmatter`);
    return {};
  }

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) {
      failures.push(`${relativePath}: invalid frontmatter line "${line}"`);
      continue;
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    values[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function requireText(relativePath, text, expected) {
  if (!text.includes(expected)) {
    failures.push(`${relativePath}: expected "${expected}"`);
  }
}

function requirePattern(relativePath, text, pattern, description) {
  if (!pattern.test(text)) {
    failures.push(`${relativePath}: expected ${description}`);
  }
}

async function verifyRelativeLinks(skill, text) {
  const skillRoot = path.join(root, '.agents', 'skills', skill);
  const matches = text.matchAll(/\]\((?!https?:\/\/|#)([^)]+)\)/g);

  for (const match of matches) {
    const relativeTarget = decodeURIComponent(match[1].split('#')[0]);
    if (!relativeTarget) continue;

    const resolved = path.resolve(skillRoot, relativeTarget);
    if (!resolved.startsWith(`${skillRoot}${path.sep}`)) {
      failures.push(
        `.agents/skills/${skill}/SKILL.md: reference escapes the skill folder: ${relativeTarget}`,
      );
      continue;
    }

    try {
      const target = await stat(resolved);
      if (!target.isFile()) throw new Error('not a file');
    } catch {
      failures.push(
        `.agents/skills/${skill}/SKILL.md: missing referenced file ${relativeTarget}`,
      );
    }
  }
}

const canonicalSkills = await listDirectories('.agents/skills');
const claudeSkills = await listDirectories('.claude/skills');

if (canonicalSkills.join('|') !== claudeSkills.join('|')) {
  failures.push(
    `Skill folders differ: canonical=[${canonicalSkills.join(', ')}], claude=[${claudeSkills.join(', ')}]`,
  );
}

for (const skill of canonicalSkills) {
  const canonicalPath = `.agents/skills/${skill}/SKILL.md`;
  const canonical = await readRequired(canonicalPath);
  const canonicalFrontmatter = parseFrontmatter(canonicalPath, canonical);
  const canonicalKeys = Object.keys(canonicalFrontmatter);
  const unsupportedCanonicalKeys = canonicalKeys.filter(
    (key) => !['name', 'description', 'origin'].includes(key),
  );

  if (unsupportedCanonicalKeys.length > 0) {
    failures.push(
      `${canonicalPath}: unsupported frontmatter keys ${unsupportedCanonicalKeys.join(', ')}`,
    );
  }
  if (canonicalFrontmatter.name !== skill) {
    failures.push(
      `${canonicalPath}: frontmatter name must match folder "${skill}"`,
    );
  }
  if (!canonicalFrontmatter.description) {
    failures.push(`${canonicalPath}: description is required`);
  }
  if (canonical.split(/\r?\n/).length > 700) {
    failures.push(
      `${canonicalPath}: SKILL.md exceeds the 700-line hard budget; move optional detail into references`,
    );
  }
  if (/\[TODO|TODO:/i.test(canonical)) {
    failures.push(`${canonicalPath}: unresolved TODO scaffold content`);
  }
  await verifyRelativeLinks(skill, canonical);

  const metadataPath = `.agents/skills/${skill}/agents/openai.yaml`;
  const metadata = await readRequired(metadataPath);
  requireText(metadataPath, metadata, 'display_name:');
  requireText(metadataPath, metadata, 'short_description:');
  requireText(metadataPath, metadata, 'default_prompt:');
  requireText(metadataPath, metadata, 'allow_implicit_invocation: true');

  const wrapperPath = `.claude/skills/${skill}/SKILL.md`;
  const wrapper = await readRequired(wrapperPath);
  const wrapperFrontmatter = parseFrontmatter(wrapperPath, wrapper);
  const wrapperKeys = Object.keys(wrapperFrontmatter).sort();

  if (wrapperKeys.join('|') !== 'description|name') {
    failures.push(
      `${wrapperPath}: wrapper frontmatter may contain only name and description`,
    );
  }
  if (wrapperFrontmatter.name !== skill) {
    failures.push(
      `${wrapperPath}: frontmatter name must match folder "${skill}"`,
    );
  }
  requireText(wrapperPath, wrapper, canonicalPath);
  if (wrapper.split(/\r?\n/).length > 20) {
    failures.push(
      `${wrapperPath}: wrapper is too large; keep policy in the canonical skill`,
    );
  }
  if (
    wrapper.includes('disable-model-invocation: true') ||
    wrapper.includes('user-invocable: false')
  ) {
    failures.push(
      `${wrapperPath}: current domain skills must remain automatically and explicitly invocable`,
    );
  }
}

const rootClaude = await readRequired('CLAUDE.md');
requireText('CLAUDE.md', rootClaude, '@AGENTS.md');
requireText('CLAUDE.md', rootClaude, 'npm.cmd run agents:verify');

const webAgents = await readRequired('apps/web-app/AGENTS.md');
requireText(
  'apps/web-app/AGENTS.md',
  webAgents,
  'docs/architecture/visual-design-system.md',
);
const webClaude = await readRequired('apps/web-app/CLAUDE.md');
requireText('apps/web-app/CLAUDE.md', webClaude, '@AGENTS.md');

const contextRouter = await readRequired(
  'tools/scripts/workspace/show-context.ps1',
);
requirePattern(
  'tools/scripts/workspace/show-context.ps1',
  contextRouter,
  /AGENTS\\\.md|AGENTS\.md/,
  'AGENTS.md context routing',
);
requireText(
  'tools/scripts/workspace/show-context.ps1',
  contextRouter,
  'docs/architecture/agent-harness.md',
);

const packageJson = await readRequired('package.json');
requireText('package.json', packageJson, '"harness:context"');

const ciWorkflow = await readRequired('.github/workflows/ci.yml');
requireText('.github/workflows/ci.yml', ciWorkflow, 'npm run agents:verify');

const codexConfig = await readRequired('.codex/config.toml');
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
  const codexAgent = await readRequired(codexPath);
  const claudeAgent = await readRequired(claudePath);
  if (!codexAgent || !claudeAgent) {
    failures.push(`Logical role is incomplete: ${role}`);
  }
}

const reviewer = await readRequired('.codex/agents/reviewer.toml');
requireText(
  '.codex/agents/reviewer.toml',
  reviewer,
  'sandbox_mode = "read-only"',
);
requireText('.codex/agents/reviewer.toml', reviewer, 'evidence-first');

const frontendDesigner = await readRequired(
  '.codex/agents/frontend-designer.toml',
);
requireText(
  '.codex/agents/frontend-designer.toml',
  frontendDesigner,
  'desktop and mobile Playwright screenshots',
);

const implementationWorker = await readRequired(
  '.claude/agents/implementation-worker.md',
);
requireText(
  '.claude/agents/implementation-worker.md',
  implementationWorker,
  'implementation worker',
);

if (failures.length > 0) {
  console.error('Agent system validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Validated ${canonicalSkills.length} canonical skills, Claude adapters, references, context routing, CI integration, and ${logicalRolePairs.length + 1} logical agent roles.`,
);

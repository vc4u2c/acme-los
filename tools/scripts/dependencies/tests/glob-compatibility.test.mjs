import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const semver = require('semver');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const reviewedOwners = new Set([
  '@expo/cli@55.0.34',
  '@expo/config@55.0.19',
  '@expo/config-plugins@55.0.11',
  '@expo/fingerprint@0.16.8',
  '@expo/metro-config@55.0.25',
  '@jest/reporters@30.5.2',
  'jest-config@30.5.2',
  'jest-runtime@30.5.2',
  'test-exclude@7.0.2',
]);
const owners = Object.entries(lock.packages).filter(([, pkg]) => {
  const range = pkg.dependencies?.glob;
  return range && semver.minVersion(range).major >= 9;
});

function fixture(t) {
  const parent = resolve(tmpdir(), 'acme-los-dependency-tests');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'glob-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), parent);
    rmSync(directory, { recursive: true, force: true });
  });
  for (const name of [
    'packages/alpha/package.json',
    'packages/beta/package.json',
    'packages/Pods/vendor/package.json',
    'node_modules/ignored/package.json',
    'ios/Demo.xcodeproj/project.pbxproj',
    'ios/Demo.xcworkspace/contents.xcworkspacedata',
    'src/first.test.ts',
    'src/second.spec.tsx',
    'src/nested/skip.test.ts',
    'src/space name.ts',
    'src/.hidden.ts',
  ]) {
    const target = join(directory, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, name.endsWith('.json') ? '{}' : '');
  }
  return directory;
}

test('reviewed Glob owners resolve the patched release without replacing Nx minimatch', () => {
  const seen = new Set();
  for (const [path, pkg] of owners) {
    const name = path.split('node_modules/').at(-1);
    const owner = `${name}@${pkg.version}`;
    assert.ok(reviewedOwners.has(owner), `Review new Glob owner: ${owner}`);
    seen.add(owner);
    const ownerRequire = createRequire(join(root, path, 'package.json'));
    assert.equal(ownerRequire('glob/package.json').version, '14.0.5', owner);
  }
  assert.deepEqual(seen, reviewedOwners);
  const nxRequire = createRequire(require.resolve('nx/package.json'));
  assert.equal(typeof nxRequire('minimatch').makeRe, 'function');
  for (const [path, pkg] of Object.entries(lock.packages)) {
    const range = pkg.dependencies?.glob;
    if (!range || semver.minVersion(range).major >= 9) continue;
    const ownerRequire = createRequire(join(root, path, 'package.json'));
    assert.ok(
      semver.satisfies(ownerRequire('glob/package.json').version, range),
      path,
    );
    assert.equal(typeof ownerRequire('glob'), 'function', path);
  }
});

test('each reviewed owner preserves sync, async, stream, and ignored glob matches', async (t) => {
  const cwd = fixture(t);
  const pattern = 'src/**/*.{ts,tsx}';
  const options = { cwd, nodir: true, ignore: ['**/nested/**'] };
  const expected = [
    'src/first.test.ts',
    'src/second.spec.tsx',
    'src/space name.ts',
  ];
  const normalized = (values) =>
    values.map((value) => value.replaceAll('\\', '/')).sort();
  for (const [path] of owners) {
    const glob = createRequire(join(root, path, 'package.json'))('glob');
    assert.deepEqual(
      normalized(glob.globSync(pattern, options)),
      expected,
      path,
    );
    assert.deepEqual(
      normalized(await glob.glob(pattern, options)),
      expected,
      path,
    );
    const streamMatches = [];
    for await (const match of glob.globStream(pattern, options))
      streamMatches.push(match);
    assert.deepEqual(normalized(streamMatches), expected, path);
    assert.deepEqual(await glob.glob('missing/**/*.ts', { cwd }), [], path);
    await assert.rejects(
      glob.glob('**/*', {
        cwd,
        signal: AbortSignal.abort(new Error('cancelled')),
      }),
      /cancelled/,
    );
  }
});

test('Expo first-match cancellation, workspace discovery, and Xcode selection remain compatible', async (t) => {
  const cwd = fixture(t);
  const cliRoot = dirname(require.resolve('@expo/cli/package.json'));
  const { anyMatchAsync, everyMatchAsync } = require(
    join(cliRoot, 'build/src/utils/glob.js'),
  );
  const first = await anyMatchAsync('src/*.test.ts', { cwd });
  assert.equal(first.length, 1);
  assert.equal(first[0].replaceAll('\\', '/'), 'src/first.test.ts');
  assert.deepEqual(await anyMatchAsync('missing/*.ts', { cwd }), []);
  assert.equal((await everyMatchAsync('src/*.ts', { cwd })).length, 2);
  const { resolveXcodeProject } = require(
    join(cliRoot, 'build/src/run/ios/options/resolveXcodeProject.js'),
  );
  const project = resolveXcodeProject(cwd);
  assert.equal(project.isWorkspace, true);
  assert.equal(resolve(project.name), join(cwd, 'ios', 'Demo.xcworkspace'));
  const metroRoot = dirname(require.resolve('@expo/metro-config/package.json'));
  const { globAllPackageJsonPaths } = require(
    join(metroRoot, 'build/getWatchFolders.js'),
  );
  assert.deepEqual(globAllPackageJsonPaths(cwd, ['packages/**']).sort(), [
    join(cwd, 'packages', 'alpha', 'package.json'),
    join(cwd, 'packages', 'beta', 'package.json'),
  ]);
});

test('Istanbul coverage discovery preserves excludes and negated excludes', async (t) => {
  const cwd = fixture(t);
  const babelRequire = createRequire(require.resolve('babel-plugin-istanbul'));
  const TestExclude = babelRequire('test-exclude');
  const coverageRequire = createRequire(babelRequire.resolve('test-exclude'));
  assert.equal(coverageRequire('minimatch/package.json').version, '11.0.8');
  const options = {
    cwd,
    include: ['src/**/*'],
    exclude: ['**/nested/**', '**/.hidden.ts'],
    extension: ['.ts', '.tsx'],
  };
  const expected = [
    'src/first.test.ts',
    'src/second.spec.tsx',
    'src/space name.ts',
  ];
  const filter = new TestExclude(options);
  assert.equal(
    filter.shouldInstrument(join(cwd, 'src', 'first.test.ts')),
    true,
  );
  assert.equal(filter.shouldInstrument(join(cwd, 'src', '.hidden.ts')), false);
  assert.equal(filter.shouldInstrument(join(cwd, 'src', 'asset.png')), false);
  assert.equal(filter.shouldInstrument(join(cwd, '..', 'outside.ts')), false);
  assert.equal(
    filter.shouldInstrument(join(cwd, 'node_modules', 'ignored', 'source.ts')),
    false,
  );
  assert.deepEqual(filter.globSync().sort(), expected);
  assert.deepEqual((await filter.glob()).sort(), expected);
  const restored = new TestExclude({
    ...options,
    exclude: [...options.exclude, '!**/nested/skip.test.ts'],
  });
  const restoredExpected = [...expected, 'src/nested/skip.test.ts'].sort();
  assert.deepEqual(restored.globSync().sort(), restoredExpected);
  assert.deepEqual((await restored.glob()).sort(), restoredExpected);
  const withDotfiles = new TestExclude({
    ...options,
    exclude: ['**/nested/**'],
  });
  assert.equal(
    withDotfiles.shouldInstrument(join(cwd, 'src', '.hidden.ts')),
    true,
  );
  const negatedInclude = new TestExclude({
    ...options,
    include: ['src/**/*', '!**/*.spec.tsx'],
  });
  assert.equal(
    negatedInclude.shouldInstrument(join(cwd, 'src', 'second.spec.tsx')),
    false,
  );
});

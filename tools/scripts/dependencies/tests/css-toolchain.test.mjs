import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import plugin from 'tailwindcss/plugin.js';

// Resolve nesting through Tailwind so this exercises the overridden owner path.
const require = createRequire(import.meta.url);
const tailwindRequire = createRequire(require.resolve('tailwindcss'));
const nested = tailwindRequire('postcss-nested');

test('both CSS owners load the reviewed patched parser', () => {
  for (const owner of ['tailwindcss', 'postcss-nested']) {
    const ownerRequire = createRequire(require.resolve(owner));
    assert.equal(
      ownerRequire('postcss-selector-parser/package.json').version,
      '7.1.6',
      `${owner} must not retain a vulnerable nested parser`,
    );
  }
});

function declarations(root) {
  const rules = new Map();
  root.walkRules((rule) => {
    const values = {};
    rule.walkDecls((declaration) => {
      values[declaration.prop] = declaration.value;
    });
    rules.set(rule.selector, values);
  });
  return rules;
}

test('Tailwind preserves variant insertion, escaping, and apply selectors', async () => {
  const candidates = [
    'hover:bg-red-500',
    'focus-visible:ring-2',
    'group-hover:focus:text-blue-600',
    'group-hover/item:underline',
    'group-hover:group-focus:underline',
    'peer-checked:opacity-100',
    'peer-checked/item:disabled:opacity-50',
    'dark:hover:bg-black',
    '[&>span]:font-bold',
    'data-[state=open]:block',
    "before:content-['x']",
    'hover:control',
  ];
  const result = await postcss([
    tailwind({
      content: [{ raw: candidates.join(' ') }],
      darkMode: 'class',
      plugins: [
        plugin(({ addComponents }) => {
          addComponents({ '.control > .control-label': { display: 'block' } });
        }),
      ],
    }),
  ]).process(
    '@tailwind components; @tailwind utilities; .action { @apply px-4 hover:bg-red-500; }',
    { from: undefined },
  );
  const rules = declarations(result.root);
  assert.equal(rules.size, 14);
  assert.deepEqual(rules.get('.action'), {
    'padding-left': '1rem',
    'padding-right': '1rem',
  });
  assert.deepEqual(
    rules.get('.action:hover'),
    rules.get('.hover\\:bg-red-500:hover'),
  );
  assert.equal(
    rules.get('.action:hover')?.['background-color'],
    'rgb(239 68 68 / var(--tw-bg-opacity, 1))',
  );
  assert.equal(
    rules.get('.hover\\:control:hover > .control-label')?.display,
    'block',
  );
  assert.equal(
    rules.get('.group:hover .group-hover\\:focus\\:text-blue-600:focus')?.color,
    'rgb(37 99 235 / var(--tw-text-opacity, 1))',
  );
  assert.equal(
    rules.get('.group\\/item:hover .group-hover\\/item\\:underline')?.[
      'text-decoration-line'
    ],
    'underline',
  );
  assert.equal(
    rules.get('.peer:checked ~ .peer-checked\\:opacity-100')?.opacity,
    '1',
  );
  assert.equal(
    rules.get('.group:hover:focus .group-hover\\:group-focus\\:underline')?.[
      'text-decoration-line'
    ],
    'underline',
  );
  assert.equal(
    rules.get(
      '.peer\\/item:checked ~ .peer-checked\\/item\\:disabled\\:opacity-50:disabled',
    )?.opacity,
    '0.5',
  );
  assert.equal(
    rules.get('.dark\\:hover\\:bg-black:hover:is(.dark *)')?.[
      'background-color'
    ],
    'rgb(0 0 0 / var(--tw-bg-opacity, 1))',
  );
  assert.equal(
    rules.get('.\\[\\&\\>span\\]\\:font-bold>span')?.['font-weight'],
    '700',
  );
  assert.equal(
    rules.get('.data-\\[state\\=open\\]\\:block[data-state="open"]')?.display,
    'block',
  );
  assert.equal(
    rules.get(".before\\:content-\\[\\'x\\'\\]::before")?.content,
    'var(--tw-content)',
  );
  assert.match(
    rules.get('.focus-visible\\:ring-2:focus-visible')?.['box-shadow'] ?? '',
    /var\(--tw-ring-shadow\)/,
  );
});

test('nesting preserves selector lists, cloned parents, and media bubbling', async () => {
  const result = await postcss([nested]).process(
    `.card, .panel {
      &:hover, &:focus { color: red; }
      & > :is(&__label, &__help) { display: block; }
      &--active { opacity: 1; }
      .child { visibility: visible; }
      @media (min-width: 640px) { & + & { gap: 1rem; } }
    }`,
    { from: undefined },
  );
  assert.deepEqual(Object.fromEntries(declarations(result.root)), {
    '.card:hover, .card:focus, .panel:hover, .panel:focus': { color: 'red' },
    '.card > :is(.card__label,.card__help), .panel > :is(.panel__label,.panel__help)':
      { display: 'block' },
    '.card--active, .panel--active': { opacity: '1' },
    '.card .child, .panel .child': { visibility: 'visible' },
    '.card + .card, .panel + .panel': { gap: '1rem' },
  });
  const media = result.root.nodes.find((node) => node.type === 'atrule');
  assert.equal(media?.name, 'media');
  assert.equal(media?.params, '(min-width: 640px)');
  assert.equal(media?.nodes[0].selector, '.card + .card, .panel + .panel');
});

test('flat and malformed selector inputs terminate within a bounded process', () => {
  // A child-process deadline also bounds synchronous parser failures.
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
    const assert = require('node:assert/strict');
    const parser = require(${JSON.stringify(tailwindRequire.resolve('postcss-selector-parser'))});
    const input = '.item'.repeat(12000);
    const ast = parser().astSync(input);
    assert.equal(ast.first.nodes.length, 12000);
    assert.equal(ast.toString(), input);
    assert.throws(() => parser().astSync('[missing='));
    assert.throws(
      () => parser().astSync(':is('.repeat(2000) + '.a' + ')'.repeat(2000)),
      error => error instanceof Error && !(error instanceof RangeError),
    );
  `,
    ],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test('NativeWind preserves native declarations and interaction metadata', async () => {
  const previousPlatform = process.env.NATIVEWIND_OS;
  process.env.NATIVEWIND_OS = 'android';
  try {
    const {
      cssToReactNativeRuntime,
    } = require('react-native-css-interop/css-to-rn');
    const result = await postcss([
      tailwind({
        content: [{ raw: 'p-4 text-blue-600 dark:bg-black active:opacity-50' }],
        presets: [require('nativewind/preset')],
      }),
    ]).process('@tailwind utilities;', { from: undefined });
    const compiled = cssToReactNativeRuntime(result.css);
    assert.equal(compiled.$compiled, true);
    assert.deepEqual(compiled.rules['p-4'].n[0].d, [[{ padding: 14 }]]);
    assert.deepEqual(compiled.rules['text-blue-600'].n[0].d, [
      [{ color: '#2563eb' }],
    ]);
    assert.deepEqual(compiled.rules['active:opacity-50'].n[0].pseudoClasses, {
      active: true,
    });
    assert.deepEqual(compiled.rules['active:opacity-50'].n[0].d, [
      [{ opacity: 0.5 }],
    ]);
    assert.deepEqual(compiled.rules['dark:bg-black'].n[0].d, [
      [{ backgroundColor: '#000000' }],
    ]);
    assert.equal(
      compiled.rules['dark:bg-black'].n[0].media[0].condition.value.name,
      'prefers-color-scheme',
    );
  } finally {
    if (previousPlatform === undefined) delete process.env.NATIVEWIND_OS;
    else process.env.NATIVEWIND_OS = previousPlatform;
  }
});

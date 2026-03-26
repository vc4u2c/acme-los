import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:core',
              onlyDependOnLibsWithTags: ['scope:core'],
            },
            {
              sourceTag: 'scope:domain',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:domain'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:domain',
                'scope:api',
              ],
            },
            {
              sourceTag: 'scope:ui',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:domain',
                'scope:ui',
              ],
            },
            {
              sourceTag: 'scope:auth',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:auth',
                'scope:api',
              ],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:domain',
                'scope:api',
                'scope:ui',
                'scope:auth',
              ],
            },
            {
              sourceTag: 'platform:web',
              notDependOnLibsWithTags: ['platform:mobile'],
            },
            {
              sourceTag: 'platform:mobile',
              notDependOnLibsWithTags: ['platform:web'],
            },
            {
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:domain',
                'scope:api',
                'scope:ui',
                'scope:auth',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];

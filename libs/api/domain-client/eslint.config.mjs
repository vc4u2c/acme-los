import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['libs/api/domain-client/**/*.{ts,tsx,js,jsx}'],
    rules: {},
  },
];

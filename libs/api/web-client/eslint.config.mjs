import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['libs/api/web-client/**/*.{ts,tsx,js,jsx}'],
    rules: {},
  },
];

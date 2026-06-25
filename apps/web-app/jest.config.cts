const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  dir: './',
});

const config = {
  displayName: 'web-app',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleNameMapper: {
    '^@acme-los/core/analytics$':
      '<rootDir>/../../libs/core/analytics/src/index.ts',
    '^@acme-los/core/config$': '<rootDir>/../../libs/core/config/src/index.ts',
    '^@acme-los/core/logger$': '<rootDir>/../../libs/core/logger/src/index.ts',
    '^@acme-los/core/logger/trace-context$':
      '<rootDir>/../../libs/core/logger/src/lib/trace-context.ts',
    '^@acme-los/ui-web$': '<rootDir>/../../libs/ui/web/src/index.ts',
  },
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web-app',
  testEnvironment: 'jsdom',
  // Route specs mutate process.env to exercise runtime-only Next/BFF modes.
  maxWorkers: 1,
};

module.exports = createJestConfig(config);

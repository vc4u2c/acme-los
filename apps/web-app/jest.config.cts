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
    '^@acme-los/core/config$': '<rootDir>/../../libs/core/config/src/index.ts',
    '^@acme-los/ui-web$': '<rootDir>/../../libs/ui/web/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web-app',
  testEnvironment: 'jsdom',
};

module.exports = createJestConfig(config);

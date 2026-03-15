/// <reference types="jest" />
/// <reference types="node" />
module.exports = {
  displayName: 'mobile-app',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|react-native|@gluestack-ui|@react-native-aria)/',
  ],
  moduleNameMapper: {
    '^@acme-los/core/config$': '<rootDir>/../../libs/core/config/src/index.ts',
    '^@acme-los/ui-mobile$': '<rootDir>/../../libs/ui/mobile/src/index.ts',
    '\\.svg$': '@nx/expo/plugins/jest/svg-mock',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc.js',
      },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|obj)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  coverageDirectory: '../../coverage/apps/mobile-app',
};

const { execSync } = require('node:child_process');
const { version } = require('./package.json');

function resolveGitBuildId() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return null;
  }
}

process.env.EXPO_PUBLIC_APP_VERSION ??= version;
process.env.EXPO_PUBLIC_APP_ENVIRONMENT ??= 'local';
process.env.EXPO_PUBLIC_APP_BUILD ??= resolveGitBuildId() ?? '';

const oktaIssuer = process.env.EXPO_PUBLIC_OKTA_ISSUER ?? null;
const oktaClientId = process.env.EXPO_PUBLIC_OKTA_CLIENT_ID ?? null;
const oktaRedirectUri = process.env.EXPO_PUBLIC_OKTA_REDIRECT_URI ?? null;
const oktaFundingAcrValues =
  process.env.EXPO_PUBLIC_OKTA_FUNDING_ACR_VALUES ?? null;

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'MobileApp',
    slug: 'mobile-app',
    version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'mobile-app',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
    },
    extra: {
      appVersion: version,
      appBuild: process.env.EXPO_PUBLIC_APP_BUILD,
      appEnvironment: process.env.EXPO_PUBLIC_APP_ENVIRONMENT,
      auth: {
        okta: {
          issuer: oktaIssuer,
          clientId: oktaClientId,
          redirectUri: oktaRedirectUri,
          fundingStepUpAcrValues: oktaFundingAcrValues,
        },
      },
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
    ],
  },
};

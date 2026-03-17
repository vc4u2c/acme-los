const { version } = require('./package.json');

process.env.EXPO_PUBLIC_APP_VERSION ??= version;

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

import type { ReactNode } from 'react';

jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

jest.mock('expo-constants', () => {
  const expoConfig = {
    version: 'test-version',
    extra: {
      appVersion: 'test-version',
    },
  };

  return {
    __esModule: true,
    default: {
      expoConfig,
    },
    expoConfig,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const defaultInsets = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const defaultFrame = {
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  };
  const SafeAreaInsetsContext = mockReact.createContext(defaultInsets);
  const SafeAreaFrameContext = mockReact.createContext(defaultFrame);

  const SafeAreaProvider = ({ children }: { children: ReactNode }) =>
    mockReact.createElement(
      SafeAreaFrameContext.Provider,
      { value: defaultFrame },
      mockReact.createElement(
        SafeAreaInsetsContext.Provider,
        { value: defaultInsets },
        children,
      ),
    );
  const SafeAreaView = ({ children }: { children: ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children);

  SafeAreaProvider.displayName = 'SafeAreaProvider';
  SafeAreaView.displayName = 'SafeAreaView';

  return {
    SafeAreaFrameContext,
    SafeAreaInsetsContext,
    SafeAreaProvider,
    SafeAreaView,
    initialWindowMetrics: {
      frame: defaultFrame,
      insets: defaultInsets,
    },
    useSafeAreaFrame: () => defaultFrame,
    useSafeAreaInsets: () => defaultInsets,
  };
});

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}

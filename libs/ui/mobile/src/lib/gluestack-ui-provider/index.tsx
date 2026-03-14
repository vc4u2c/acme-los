import React from 'react';
import { View } from 'react-native';
import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';
import { config } from './config';
import { GluestackThemeModeProvider } from './theme-mode';

export function GluestackUIProvider({
  mode = 'light',
  ...props
}: {
  mode?: 'light' | 'dark';
  children?: React.ReactNode;
  style?: object;
}) {
  return (
    <GluestackThemeModeProvider value={mode}>
      <View
        style={[
          config[mode],
          { flex: 1, height: '100%', width: '100%' },
          props.style,
        ]}
      >
        <OverlayProvider>
          <ToastProvider>{props.children}</ToastProvider>
        </OverlayProvider>
      </View>
    </GluestackThemeModeProvider>
  );
}

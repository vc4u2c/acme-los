import React from 'react';

export type GluestackThemeMode = 'light' | 'dark';

const GluestackThemeModeContext =
  React.createContext<GluestackThemeMode>('light');

export function GluestackThemeModeProvider({
  children,
  value,
}: {
  children?: React.ReactNode;
  value: GluestackThemeMode;
}): React.ReactElement {
  return (
    <GluestackThemeModeContext.Provider value={value}>
      {children}
    </GluestackThemeModeContext.Provider>
  );
}

export function useGluestackThemeMode(): GluestackThemeMode {
  return React.useContext(GluestackThemeModeContext);
}

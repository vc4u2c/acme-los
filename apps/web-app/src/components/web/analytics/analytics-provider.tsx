'use client';

import * as React from 'react';
import type { AnalyticsRuntimeConfig } from '../../../lib/analytics/config';
import {
  type AcmeAnalyticsEvent,
  pushAnalyticsEvent,
} from '../../../lib/analytics/data-layer';

type AnalyticsContextValue = {
  config: AnalyticsRuntimeConfig;
  trackEvent: (
    event: AcmeAnalyticsEvent,
    options?: { sendToGa4?: boolean },
  ) => void;
};

const AnalyticsContext = React.createContext<AnalyticsContextValue | null>(
  null,
);

export function AnalyticsProvider({
  config,
  children,
}: {
  config: AnalyticsRuntimeConfig;
  children: React.ReactNode;
}): React.ReactElement {
  const trackEvent = React.useCallback(
    (
      event: AcmeAnalyticsEvent,
      options: { sendToGa4?: boolean } = {},
    ): void => {
      if (!config.enabled) {
        return;
      }

      pushAnalyticsEvent(event, {
        mode: options.sendToGa4 ? 'gtag' : config.mode,
      });
    },
    [config],
  );

  const value = React.useMemo<AnalyticsContextValue>(
    () => ({
      config,
      trackEvent,
    }),
    [config, trackEvent],
  );

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  const context = React.useContext(AnalyticsContext);

  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider.');
  }

  return context;
}

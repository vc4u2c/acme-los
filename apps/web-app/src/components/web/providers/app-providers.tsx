'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@acme-los/auth/web';
import type { AnalyticsRuntimeConfig } from '../../../lib/analytics/config';
import { AnalyticsRouteTracker } from '../analytics/analytics-route-tracker';
import { LeadIdTracker } from './lead-id-tracker';
import { SessionIdleManager } from './session-idle-manager';

export function AppProviders({
  analyticsConfig,
  children,
}: {
  analyticsConfig: AnalyticsRuntimeConfig;
  children: React.ReactNode;
}): React.ReactElement {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionIdleManager />
        <React.Suspense fallback={null}>
          <AnalyticsRouteTracker config={analyticsConfig} />
        </React.Suspense>
        {children}
      </AuthProvider>
      <React.Suspense fallback={null}>
        <LeadIdTracker />
      </React.Suspense>
    </QueryClientProvider>
  );
}

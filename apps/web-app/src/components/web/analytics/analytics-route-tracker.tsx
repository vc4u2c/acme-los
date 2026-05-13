'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@acme-los/auth/web';
import type { AnalyticsRuntimeConfig } from '../../../lib/analytics/config';
import {
  type AnalyticsAuthState,
  buildPageViewEvent,
  pushAnalyticsEvent,
} from '../../../lib/analytics/data-layer';

function toAnalyticsAuthState(
  status: string,
  isAuthenticated: boolean,
): AnalyticsAuthState {
  if (status === 'loading') {
    return 'loading';
  }

  if (status === 'error') {
    return 'error';
  }

  return isAuthenticated ? 'authenticated' : 'anonymous';
}

export function AnalyticsRouteTracker({
  config,
}: {
  config: AnalyticsRuntimeConfig;
}): React.ReactElement | null {
  const pathname = usePathname();
  const { session } = useAuthSession();
  const lastTrackedPathRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!config.enabled || !pathname || session.status === 'loading') {
      return;
    }

    if (lastTrackedPathRef.current === pathname) {
      return;
    }

    lastTrackedPathRef.current = pathname;

    pushAnalyticsEvent(
      buildPageViewEvent({
        config,
        pathname,
        pageTitle: document.title,
        origin: window.location.origin,
        authState: toAnalyticsAuthState(
          session.status,
          session.isAuthenticated,
        ),
        assuranceLevel: session.assuranceLevel,
      }),
      {
        mode: config.mode,
      },
    );
  }, [
    config,
    pathname,
    session.assuranceLevel,
    session.isAuthenticated,
    session.status,
  ]);

  return null;
}

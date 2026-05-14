'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@acme-los/auth/web';
import type { ApplicationStepSlug } from '../apply/step-definitions';
import {
  buildApplicationStepEvent,
  toAnalyticsAuthState,
} from '../../../lib/analytics/data-layer';
import { useAnalytics } from './analytics-provider';

export function ApplicationStepAnalyticsTracker({
  step,
}: {
  step: ApplicationStepSlug;
}): React.ReactElement | null {
  const pathname = usePathname();
  const { session } = useAuthSession();
  const { config, trackEvent } = useAnalytics();
  const lastTrackedStepRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (
      !config.enabled ||
      !pathname ||
      session.status === 'loading' ||
      lastTrackedStepRef.current === `${pathname}:${step}`
    ) {
      return;
    }

    lastTrackedStepRef.current = `${pathname}:${step}`;

    trackEvent(
      buildApplicationStepEvent({
        config,
        pathname,
        pageTitle: document.title,
        origin: window.location.origin,
        authState: toAnalyticsAuthState(
          session.status,
          session.isAuthenticated,
        ),
        assuranceLevel: session.assuranceLevel,
        eventName: 'application_step_view',
        step,
      }),
      {
        sendToGa4: true,
      },
    );
  }, [
    config,
    pathname,
    session.assuranceLevel,
    session.isAuthenticated,
    session.status,
    step,
    trackEvent,
  ]);

  return null;
}

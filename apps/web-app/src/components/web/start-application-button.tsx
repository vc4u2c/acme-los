'use client';

import * as React from 'react';
import { Button } from '@acme-los/ui-web';
import { useAuthSession } from '@acme-los/auth/web';
import { usePathname } from 'next/navigation';
import {
  buildApplicationStartEvent,
  toAnalyticsAuthState,
} from '../../lib/analytics/data-layer';
import { useAnalytics } from './analytics/analytics-provider';
import { useTrackSignInStarted } from './analytics/auth-analytics-tracker';

const firstApplicationStepPath = '/apply/personal-info';

export function StartApplicationButton(): React.ReactElement {
  const { session, signIn } = useAuthSession();
  const pathname = usePathname();
  const { config, trackEvent } = useAnalytics();
  const trackSignInStarted = useTrackSignInStarted();
  const [isLaunching, setIsLaunching] = React.useState(false);

  const trackApplicationStart = React.useCallback(() => {
    if (!config.enabled) {
      return;
    }

    trackEvent(
      buildApplicationStartEvent({
        config,
        pathname: pathname ?? '/',
        pageTitle: document.title,
        origin: window.location.origin,
        authState: toAnalyticsAuthState(
          session.status,
          session.isAuthenticated,
        ),
        assuranceLevel: session.assuranceLevel,
      }),
      {
        sendToGa4: true,
      },
    );
  }, [config, pathname, session, trackEvent]);

  const handleClick = React.useCallback(() => {
    trackApplicationStart();

    if (session.isAuthenticated) {
      window.location.assign(firstApplicationStepPath);
      return;
    }

    setIsLaunching(true);
    trackSignInStarted({
      returnTo: firstApplicationStepPath,
      minimumAssuranceLevel: 'aal1',
    });
    void signIn({
      returnTo: firstApplicationStepPath,
      minimumAssuranceLevel: 'aal1',
    }).finally(() => {
      setIsLaunching(false);
    });
  }, [
    session.isAuthenticated,
    signIn,
    trackApplicationStart,
    trackSignInStarted,
  ]);

  return (
    <Button
      type="button"
      size="lg"
      className="rounded-full bg-[var(--brand)] px-7 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
      onClick={handleClick}
    >
      {isLaunching ? 'Opening secure sign in...' : 'Start application'}
    </Button>
  );
}

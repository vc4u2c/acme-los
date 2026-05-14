'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuthSession } from '@acme-los/auth/web';
import {
  type AnalyticsAuthContext,
  bucketAnalyticsFailureReason,
  buildFundingStepUpEvent,
  buildSignInEvent,
  getAnalyticsAuthContext,
  toAnalyticsAuthState,
} from '../../../lib/analytics/data-layer';
import { useAnalytics } from './analytics-provider';

const signInAttemptStorageKey = 'acme-los.analytics.sign-in-attempt';

type StoredSignInAttempt = {
  authContext: AnalyticsAuthContext;
  assuranceLevel: string;
  startedAt: number;
};

function rememberSignInAttempt(
  authContext: AnalyticsAuthContext,
  assuranceLevel: string,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    signInAttemptStorageKey,
    JSON.stringify({
      authContext,
      assuranceLevel,
      startedAt: Date.now(),
    } satisfies StoredSignInAttempt),
  );
}

function consumeSignInAttempt(): StoredSignInAttempt | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(signInAttemptStorageKey);
  window.sessionStorage.removeItem(signInAttemptStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const value = JSON.parse(rawValue) as Partial<StoredSignInAttempt>;

    if (
      (value.authContext === 'account' ||
        value.authContext === 'application' ||
        value.authContext === 'funding_step_up' ||
        value.authContext === 'standard') &&
      typeof value.assuranceLevel === 'string'
    ) {
      return {
        authContext: value.authContext,
        assuranceLevel: value.assuranceLevel,
        startedAt:
          typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function useTrackSignInStarted(): (options: {
  returnTo?: string;
  minimumAssuranceLevel?: string;
}) => void {
  const pathname = usePathname();
  const { session } = useAuthSession();
  const { config, trackEvent } = useAnalytics();

  return React.useCallback(
    ({
      returnTo,
      minimumAssuranceLevel = 'aal1',
    }: {
      returnTo?: string;
      minimumAssuranceLevel?: string;
    }): void => {
      if (!config.enabled) {
        return;
      }

      const authContext = getAnalyticsAuthContext(
        returnTo,
        minimumAssuranceLevel,
      );
      const currentPathname = pathname ?? '/';
      const common = {
        config,
        pathname: currentPathname,
        pageTitle: document.title,
        origin: window.location.origin,
        authState: toAnalyticsAuthState(
          session.status,
          session.isAuthenticated,
        ),
        assuranceLevel: session.assuranceLevel,
      };

      rememberSignInAttempt(authContext, minimumAssuranceLevel);
      trackEvent(
        buildSignInEvent({
          ...common,
          eventName: 'sign_in_started',
          authContext,
        }),
        {
          sendToGa4: true,
        },
      );

      if (authContext === 'funding_step_up') {
        trackEvent(
          buildFundingStepUpEvent({
            ...common,
            eventName: 'funding_step_up_started',
            result: 'started',
          }),
          {
            sendToGa4: true,
          },
        );
      }
    },
    [config, pathname, session, trackEvent],
  );
}

export function AuthAnalyticsTracker(): React.ReactElement | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAuthSession();
  const { config, trackEvent } = useAnalytics();
  const lastErrorKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const authError = searchParams.get('authError')?.trim();

    if (!config.enabled || !authError || !pathname) {
      return;
    }

    const errorKey = `${pathname}:${authError}`;
    if (lastErrorKeyRef.current === errorKey) {
      return;
    }

    lastErrorKeyRef.current = errorKey;
    consumeSignInAttempt();

    const minimumAssuranceLevel = searchParams.get('aal') ?? 'aal1';
    const authContext = getAnalyticsAuthContext(
      searchParams.get('returnTo') ?? pathname,
      minimumAssuranceLevel,
    );

    trackEvent(
      buildSignInEvent({
        config,
        pathname,
        pageTitle: document.title,
        origin: window.location.origin,
        authState: toAnalyticsAuthState(
          session.status,
          session.isAuthenticated,
        ),
        assuranceLevel: session.assuranceLevel,
        eventName: 'sign_in_failed',
        authContext,
        failureReasonBucket: bucketAnalyticsFailureReason(authError),
      }),
      {
        sendToGa4: true,
      },
    );
  }, [
    config,
    pathname,
    searchParams,
    session.assuranceLevel,
    session.isAuthenticated,
    session.status,
    trackEvent,
  ]);

  React.useEffect(() => {
    if (
      !config.enabled ||
      !pathname ||
      session.status !== 'authenticated' ||
      !session.isAuthenticated
    ) {
      return;
    }

    const attempt = consumeSignInAttempt();
    if (!attempt) {
      return;
    }

    const common = {
      config,
      pathname,
      pageTitle: document.title,
      origin: window.location.origin,
      authState: toAnalyticsAuthState(session.status, session.isAuthenticated),
      assuranceLevel: session.assuranceLevel,
    };

    trackEvent(
      buildSignInEvent({
        ...common,
        eventName: 'login',
        authContext: attempt.authContext,
      }),
      {
        sendToGa4: true,
      },
    );

    if (
      attempt.authContext === 'funding_step_up' ||
      session.assuranceLevel === 'aal2'
    ) {
      trackEvent(
        buildFundingStepUpEvent({
          ...common,
          eventName: 'funding_step_up_completed',
          result: 'success',
        }),
        {
          sendToGa4: true,
        },
      );
    }
  }, [
    config,
    pathname,
    session.assuranceLevel,
    session.isAuthenticated,
    session.status,
    trackEvent,
  ]);

  React.useEffect(() => {
    if (!config.enabled || !pathname || session.status !== 'error') {
      return;
    }

    const attempt = consumeSignInAttempt();
    if (!attempt) {
      return;
    }

    trackEvent(
      buildSignInEvent({
        config,
        pathname,
        pageTitle: document.title,
        origin: window.location.origin,
        authState: 'error',
        assuranceLevel: session.assuranceLevel,
        eventName: 'sign_in_failed',
        authContext: attempt.authContext,
        failureReasonBucket: bucketAnalyticsFailureReason(session.errorMessage),
      }),
      {
        sendToGa4: true,
      },
    );
  }, [
    config,
    pathname,
    session.assuranceLevel,
    session.errorMessage,
    session.status,
    trackEvent,
  ]);

  return null;
}

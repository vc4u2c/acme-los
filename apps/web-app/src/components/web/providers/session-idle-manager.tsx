'use client';

import * as React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@acme-los/ui-web';
import { useAuthSession } from '@acme-los/auth/web';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown'] as const;

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getRemainingSeconds(idleExpiresAt: number): number {
  return Math.max(idleExpiresAt - getCurrentEpochSeconds(), 0);
}

function formatCountdown(totalSeconds: number): string {
  const roundedSeconds = Math.max(Math.ceil(totalSeconds), 0);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getTouchThrottleMilliseconds(idleTimeoutSeconds: number): number {
  return Math.max(
    10_000,
    Math.min(Math.floor((idleTimeoutSeconds * 1000) / 4), 60_000),
  );
}

export function SessionIdleManager(): React.ReactElement | null {
  const { session, sessionTiming, signOut, touchSession } = useAuthSession();
  const [isWarningOpen, setIsWarningOpen] = React.useState(false);
  const [isTouching, setIsTouching] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState(0);
  const isAuthenticated =
    session.status === 'authenticated' &&
    session.isAuthenticated &&
    Boolean(sessionTiming);
  const timingRef = React.useRef(sessionTiming);
  const warningOpenRef = React.useRef(isWarningOpen);
  const touchInFlightRef = React.useRef(false);
  const lastTouchAtRef = React.useRef(Date.now());
  const hasAutoSignedOutRef = React.useRef(false);

  React.useEffect(() => {
    timingRef.current = sessionTiming;
  }, [sessionTiming]);

  React.useEffect(() => {
    warningOpenRef.current = isWarningOpen;
  }, [isWarningOpen]);

  React.useEffect(() => {
    if (!isAuthenticated || !sessionTiming) {
      setIsWarningOpen(false);
      setSecondsRemaining(0);
      hasAutoSignedOutRef.current = false;
      return;
    }

    hasAutoSignedOutRef.current = false;
    lastTouchAtRef.current = Date.now();

    const updateCountdown = () => {
      const remainingSeconds = getRemainingSeconds(sessionTiming.idleExpiresAt);

      setSecondsRemaining(remainingSeconds);

      if (remainingSeconds <= 0 && !hasAutoSignedOutRef.current) {
        hasAutoSignedOutRef.current = true;
        void signOut();
      }
    };

    const currentEpochSeconds = getCurrentEpochSeconds();
    const warningStartsAt =
      sessionTiming.idleExpiresAt - sessionTiming.warningSeconds;
    const warningDelayMilliseconds = Math.max(
      (warningStartsAt - currentEpochSeconds) * 1000,
      0,
    );
    const warningTimer = window.setTimeout(() => {
      updateCountdown();
      setIsWarningOpen(true);
    }, warningDelayMilliseconds);
    const countdownTimer = window.setInterval(updateCountdown, 1000);

    updateCountdown();

    return () => {
      window.clearTimeout(warningTimer);
      window.clearInterval(countdownTimer);
    };
  }, [
    isAuthenticated,
    sessionTiming?.idleExpiresAt,
    sessionTiming?.warningSeconds,
    signOut,
  ]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    function handleActivity() {
      const currentTiming = timingRef.current;

      if (
        !currentTiming ||
        warningOpenRef.current ||
        touchInFlightRef.current
      ) {
        return;
      }

      const currentTime = Date.now();
      const touchThrottleMilliseconds = getTouchThrottleMilliseconds(
        currentTiming.idleTimeoutSeconds,
      );

      if (currentTime - lastTouchAtRef.current < touchThrottleMilliseconds) {
        return;
      }

      lastTouchAtRef.current = currentTime;
      touchInFlightRef.current = true;

      void touchSession().finally(() => {
        touchInFlightRef.current = false;
      });
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, {
        passive: true,
        capture: true,
      });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity, {
          capture: true,
        });
      }
    };
  }, [isAuthenticated, touchSession]);

  const staySignedIn = React.useCallback(async () => {
    setIsTouching(true);

    try {
      const touched = await touchSession();

      if (touched) {
        setIsWarningOpen(false);
      }
    } finally {
      setIsTouching(false);
    }
  }, [touchSession]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Dialog open={isWarningOpen}>
      <DialogContent
        className="w-[calc(100vw-2rem)] rounded-lg border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:max-w-md"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl leading-tight text-[var(--foreground)]">
            Still with us?
          </DialogTitle>
          <DialogDescription className="leading-6 text-[var(--muted-foreground)]">
            For your security, this session will close unless you stay signed
            in.
          </DialogDescription>
        </DialogHeader>

        <div
          aria-live="polite"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Time remaining
          </p>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-[var(--foreground)]">
            {formatCountdown(secondsRemaining)}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
          <Button
            type="button"
            disabled={isTouching}
            onClick={() => {
              void staySignedIn();
            }}
          >
            {isTouching ? 'Checking session' : 'Stay signed in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

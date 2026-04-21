'use client';

import * as React from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { createWebApiClient } from '@acme-los/api/web-client';
import {
  collectBrowserTelemetry,
  createBrowserTraceLogger,
} from '../../lib/observability/browser-trace-logger';

type LoggingDemoResponse = {
  acceptedAt: string;
  event: string;
  events: string[];
  traceId: string;
};

async function postLoggingDemoEvent(
  payload: Record<string, unknown>,
): Promise<LoggingDemoResponse> {
  const csrfToken = await createWebApiClient().security.getCsrfToken();
  const response = await fetch('/api/logging-demo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Logging demo request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as LoggingDemoResponse;
}

function formatResult(result: LoggingDemoResponse | null): string {
  if (!result) {
    return 'No event emitted yet';
  }

  const eventSummary = result.events.length
    ? result.events.join(' -> ')
    : result.event;

  return `${eventSummary} | ${result.traceId.slice(0, 8)} | ${new Date(
    result.acceptedAt,
  ).toLocaleTimeString()}`;
}

export function LoggingDemoClient({
  traceId,
}: {
  traceId: string;
}): React.ReactElement {
  const browserLogger = React.useMemo(
    () => createBrowserTraceLogger({ traceId, route: '/logging-demo' }),
    [traceId],
  );
  const [lastTraceResult, setLastTraceResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [lastServerResult, setLastServerResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<
    'trace' | 'server' | null
  >(null);

  async function runTracedFlow() {
    setErrorMessage(null);
    setPendingAction('trace');

    try {
      const clientTelemetry = collectBrowserTelemetry();
      const payload = {
        action: 'traced-client-to-server',
        traceId,
        clientTelemetry,
      };

      browserLogger.info(
        'logging.demo.client.browser',
        'Collected logging demo browser telemetry before calling the server.',
        {
          action: payload.action,
          clientTelemetry,
        },
      );

      setLastTraceResult(await postLoggingDemoEvent(payload));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to run traced logging flow.',
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function emitServerEvent() {
    setErrorMessage(null);
    setPendingAction('server');

    try {
      setLastServerResult(
        await postLoggingDemoEvent({
          action: 'server-event',
          traceId,
        }),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to emit server log event.',
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
        <CardHeader>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
            Traced flow
          </p>
          <CardTitle className="font-display text-3xl text-[var(--foreground)]">
            Browser signal, server processing, one trace
          </CardTitle>
          <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
            The browser writes a local console event, posts allowlisted
            telemetry to the server, and the server emits paired container log
            events with the same trace id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Last traced flow
            </p>
            <p
              data-testid="logging-demo-client-result"
              className="mt-3 break-words font-mono text-sm leading-7 text-[var(--foreground)]"
            >
              {formatResult(lastTraceResult)}
            </p>
          </div>
          <Button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => {
              void runTracedFlow();
            }}
            className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
          >
            {pendingAction === 'trace'
              ? 'Running traced flow'
              : 'Run traced flow'}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
        <CardHeader>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
            Server log
          </p>
          <CardTitle className="font-display text-3xl text-[var(--foreground)]">
            Server-only event
          </CardTitle>
          <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
            This writes a standalone server-side event from the Next.js runtime
            to stdout and the OpenTelemetry logs API with the same page trace
            id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Last server event
            </p>
            <p
              data-testid="logging-demo-server-result"
              className="mt-3 break-words font-mono text-sm leading-7 text-[var(--foreground)]"
            >
              {formatResult(lastServerResult)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => {
              void emitServerEvent();
            }}
            className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
          >
            {pendingAction === 'server'
              ? 'Writing server event'
              : 'Emit server-only log'}
          </Button>
          {errorMessage ? (
            <p
              role="status"
              className="rounded-[1.2rem] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)]"
            >
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

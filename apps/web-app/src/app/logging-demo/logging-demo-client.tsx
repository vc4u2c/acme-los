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
  createBrowserLogScope,
  serializeBrowserError,
} from '../../lib/observability/browser-trace-logger';

type LoggingDemoResponse = {
  acceptedAt: string;
  correlationId: string;
  event: string;
  events: string[];
  parentSpanId: string;
  serverTraceparent: string;
  spanId: string;
  traceId: string;
  traceparent: string;
};

async function postLoggingDemoEvent(
  payload: Record<string, unknown>,
  traceHeaders: Record<string, string>,
): Promise<LoggingDemoResponse> {
  const csrfToken = await createWebApiClient().security.getCsrfToken();
  const response = await fetch('/api/logging-demo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...traceHeaders,
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

  return `${eventSummary} | ${result.traceId.slice(0, 8)}:${result.spanId.slice(
    0,
    8,
  )} | ${result.correlationId.slice(0, 8)} | ${new Date(
    result.acceptedAt,
  ).toLocaleTimeString()}`;
}

export function LoggingDemoClient(): React.ReactElement {
  const [lastTraceResult, setLastTraceResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [lastServerResult, setLastServerResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [lastClientErrorResult, setLastClientErrorResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [lastServerErrorResult, setLastServerErrorResult] =
    React.useState<LoggingDemoResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<
    'trace' | 'server' | 'client-error' | 'server-error' | null
  >(null);

  async function runTracedFlow() {
    setErrorMessage(null);
    setPendingAction('trace');

    try {
      const logScope = createBrowserLogScope({ route: '/logging-demo' });
      const clientTelemetry = collectBrowserTelemetry();
      const payload = {
        action: 'traced-client-to-server',
        clientTelemetry,
      };

      logScope.logger.info(
        'logging.demo.client.browser',
        'Collected logging demo browser telemetry before calling the server.',
        {
          action: payload.action,
          clientTelemetry,
        },
      );

      setLastTraceResult(await postLoggingDemoEvent(payload, logScope.headers));
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
      const logScope = createBrowserLogScope({ route: '/logging-demo' });
      setLastServerResult(
        await postLoggingDemoEvent(
          {
            action: 'server-event',
          },
          logScope.headers,
        ),
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

  async function runClientError() {
    setErrorMessage(null);
    setPendingAction('client-error');

    try {
      const logScope = createBrowserLogScope({ route: '/logging-demo' });
      const clientTelemetry = collectBrowserTelemetry();

      try {
        throw new Error('Controlled logging demo client error.');
      } catch (error) {
        const clientError = serializeBrowserError(error);

        logScope.logger.error(
          'logging.demo.client.error.browser',
          'Captured controlled client-side logging demo error before relaying it.',
          {
            action: 'client-error',
            clientError,
            clientTelemetry,
          },
        );

        setLastClientErrorResult(
          await postLoggingDemoEvent(
            {
              action: 'client-error',
              clientError,
              clientTelemetry,
            },
            logScope.headers,
          ),
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to emit client error log.',
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function runServerError() {
    setErrorMessage(null);
    setPendingAction('server-error');

    try {
      const logScope = createBrowserLogScope({ route: '/logging-demo' });

      setLastServerErrorResult(
        await postLoggingDemoEvent(
          {
            action: 'server-error',
          },
          logScope.headers,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to emit server error log.',
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
            events with the same W3C trace context.
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
            to stdout and the OpenTelemetry logs API with fresh trace and
            correlation headers.
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
        </CardContent>
      </Card>

      <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
        <CardHeader>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
            Client error
          </p>
          <CardTitle className="font-display text-3xl text-[var(--foreground)]">
            Controlled browser failure
          </CardTitle>
          <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
            This throws and catches a browser error, logs it locally, then
            relays a bounded error payload to the server under the same headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Last client error
            </p>
            <p
              data-testid="logging-demo-client-error-result"
              className="mt-3 break-words font-mono text-sm leading-7 text-[var(--foreground)]"
            >
              {formatResult(lastClientErrorResult)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => {
              void runClientError();
            }}
            className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
          >
            {pendingAction === 'client-error'
              ? 'Logging client error'
              : 'Log client error'}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
        <CardHeader>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
            Server error
          </p>
          <CardTitle className="font-display text-3xl text-[var(--foreground)]">
            Controlled runtime failure
          </CardTitle>
          <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
            This asks the API route to throw, catch, and log a controlled server
            error with the propagated trace and correlation headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Last server error
            </p>
            <p
              data-testid="logging-demo-server-error-result"
              className="mt-3 break-words font-mono text-sm leading-7 text-[var(--foreground)]"
            >
              {formatResult(lastServerErrorResult)}
            </p>
          </div>
          <Button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => {
              void runServerError();
            }}
            className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
          >
            {pendingAction === 'server-error'
              ? 'Logging server error'
              : 'Log server error'}
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

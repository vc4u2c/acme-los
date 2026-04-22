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
  emittedEvents: string[];
  eventName: string;
  incomingTraceparent: string;
  parentSpanId: string;
  route: string;
  serverSpanId: string;
  serverTraceparent: string;
  traceId: string;
  traceFlags: string;
};

const loggingDemoRoute = '/logging-demo';

async function postObservabilityEvent(
  payload: {
    eventName: string;
    route: string;
  } & Record<string, unknown>,
  traceHeaders: Record<string, string>,
): Promise<LoggingDemoResponse> {
  const csrfToken = await createWebApiClient().security.getCsrfToken();
  const response = await fetch('/api/observability/events', {
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
      `Observability event request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as LoggingDemoResponse;
}

function IdentifierRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <code className="break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs leading-5 text-[var(--foreground)]">
        {value}
      </code>
    </div>
  );
}

function TraceResultPanel({
  result,
  emptyLabel = 'No event emitted yet',
}: {
  result: LoggingDemoResponse | null;
  emptyLabel?: string;
}): React.ReactElement {
  if (!result) {
    return (
      <p className="font-mono text-sm leading-7 text-[var(--foreground)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Emitted events
        </p>
        <p className="mt-1 break-words font-mono text-xs leading-5 text-[var(--foreground)]">
          {result.emittedEvents.join(' -> ')}
        </p>
      </div>
      <IdentifierRow label="Correlation ID" value={result.correlationId} />
      <IdentifierRow label="Trace ID" value={result.traceId} />
      <IdentifierRow label="Browser span ID" value={result.parentSpanId} />
      <IdentifierRow label="Server span ID" value={result.serverSpanId} />
      <IdentifierRow
        label="Incoming traceparent"
        value={result.incomingTraceparent}
      />
      <IdentifierRow
        label="Server traceparent"
        value={result.serverTraceparent}
      />
      <div className="grid gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Accepted at
        </span>
        <span className="font-mono text-xs text-[var(--foreground)]">
          {result.acceptedAt}
        </span>
      </div>
    </div>
  );
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
      const logScope = createBrowserLogScope({ route: loggingDemoRoute });
      const clientTelemetry = collectBrowserTelemetry();
      const payload = {
        eventName: 'logging.demo.client.received',
        route: loggingDemoRoute,
        clientTelemetry,
      };

      logScope.logger.info(
        'logging.demo.client.browser',
        'Collected logging demo browser telemetry before calling the server.',
        {
          eventName: payload.eventName,
          clientTelemetry,
        },
      );

      setLastTraceResult(
        await postObservabilityEvent(payload, logScope.headers),
      );
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
      const logScope = createBrowserLogScope({ route: loggingDemoRoute });
      setLastServerResult(
        await postObservabilityEvent(
          {
            eventName: 'logging.demo.server.manual',
            route: loggingDemoRoute,
          },
          logScope.headers,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to emit API-handled event.',
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function runClientError() {
    setErrorMessage(null);
    setPendingAction('client-error');

    try {
      const logScope = createBrowserLogScope({ route: loggingDemoRoute });
      const clientTelemetry = collectBrowserTelemetry();

      try {
        throw new Error('Controlled logging demo client error.');
      } catch (error) {
        const clientError = serializeBrowserError(error);

        logScope.logger.error(
          'logging.demo.client.error.browser',
          'Captured controlled client-side logging demo error before relaying it.',
          {
            eventName: 'logging.demo.client.error.received',
            clientError,
            clientTelemetry,
          },
        );

        setLastClientErrorResult(
          await postObservabilityEvent(
            {
              eventName: 'logging.demo.client.error.received',
              route: loggingDemoRoute,
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
      const logScope = createBrowserLogScope({ route: loggingDemoRoute });

      setLastServerErrorResult(
        await postObservabilityEvent(
          {
            eventName: 'logging.demo.server.error',
            route: loggingDemoRoute,
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
            <div data-testid="logging-demo-client-result" className="mt-3">
              <TraceResultPanel result={lastTraceResult} />
            </div>
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
            API event
          </p>
          <CardTitle className="font-display text-3xl text-[var(--foreground)]">
            API-handled event
          </CardTitle>
          <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
            This asks the generic observability endpoint to validate a bounded
            event and write it through the shared server logger with fresh trace
            and correlation headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Last API event
            </p>
            <div data-testid="logging-demo-server-result" className="mt-3">
              <TraceResultPanel result={lastServerResult} />
            </div>
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
              ? 'Writing API event'
              : 'Emit API event'}
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
            <div
              data-testid="logging-demo-client-error-result"
              className="mt-3"
            >
              <TraceResultPanel result={lastClientErrorResult} />
            </div>
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
            <div
              data-testid="logging-demo-server-error-result"
              className="mt-3"
            >
              <TraceResultPanel result={lastServerErrorResult} />
            </div>
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

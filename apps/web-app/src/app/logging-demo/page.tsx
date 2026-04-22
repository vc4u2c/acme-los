import { randomBytes } from 'node:crypto';
import { Card, CardContent, CardHeader, CardTitle } from '@acme-los/ui-web';
import { createConsoleLogger, createTraceLogger } from '@acme-los/core/logger';
import { SiteHeader } from '../../components/web/site-header';
import { LoggingDemoClient } from './logging-demo-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const logger = createConsoleLogger();

const navigationItems = [
  { href: '/', label: 'Home', match: 'exact' as const },
  { href: '/rendering-demo', label: 'Rendering' },
  { href: '/logging-demo', label: 'Logging', match: 'exact' as const },
];

function createPageRenderTraceId(): string {
  let traceId = '';

  do {
    traceId = randomBytes(16).toString('hex');
  } while (traceId === '00000000000000000000000000000000');

  return traceId;
}

export default function LoggingDemoPage() {
  const pageRenderTraceId = createPageRenderTraceId();
  const renderedAt = new Date().toISOString();
  const traceLogger = createTraceLogger(logger, {
    traceId: pageRenderTraceId,
    route: '/logging-demo',
  });

  traceLogger.event(
    'info',
    'logging.demo.server.render',
    'Rendered logging demo page on the server.',
    {
      renderedAt,
    },
  );

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Logging demo
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            Follow a traceparent from browser telemetry to container logs.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Use this route in Azure Container Apps to produce paired client and
            server log events with a fresh W3C trace context per action.
          </p>
        </div>

        <div className="mt-10">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Trace propagation
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                traceparent per action
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-base leading-7 text-[var(--muted-foreground)] sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Server render
                </p>
                <p
                  data-testid="logging-demo-rendered-at"
                  className="mt-2 break-words font-mono text-sm text-[var(--foreground)]"
                >
                  {renderedAt}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Request headers
                </p>
                <p className="mt-2 font-mono text-sm text-[var(--foreground)]">
                  traceparent
                  <br />
                  X-Correlation-ID
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  API endpoint
                </p>
                <p className="mt-2 font-mono text-sm text-[var(--foreground)]">
                  POST /api/observability/events
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5">
          <LoggingDemoClient />
        </div>
      </section>
    </main>
  );
}

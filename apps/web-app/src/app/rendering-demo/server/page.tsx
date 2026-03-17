import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from '../../../components/web/site-header';

export const dynamic = 'force-dynamic';

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/rates-terms', label: 'Rates ISR' },
  { href: '/rendering-demo/client', label: 'Client route' },
];

export default function ServerRenderingDemoPage() {
  const renderedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());
  const requestId = Math.random().toString(36).slice(2, 10).toUpperCase();

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Server rendering demo
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            This route renders on the server for every request.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Refresh this route during the demo and both the timestamp and
            request id change immediately because the page is rendered on the
            server for each request.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Request-time signal
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Server-rendered timestamp
              </CardTitle>
              <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                Reload this page and the timestamp changes immediately because
                it is generated on the server for every request.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Rendered at
                </p>
                <p
                  data-testid="server-rendered-at"
                  className="mt-3 text-2xl font-display text-[var(--foreground)]"
                >
                  {renderedAt}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Request id
                </p>
                <p
                  data-testid="server-request-id"
                  className="mt-3 text-2xl font-display text-[var(--foreground)]"
                >
                  {requestId}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Demo checklist
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Rendering comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-base leading-8 text-[var(--muted-foreground)]">
              <p>Landing page: force-static</p>
              <p>Rates and terms: ISR every 60 seconds</p>
              <p>This route: force-dynamic server rendering on every refresh</p>
              <p>Client demo: browser-managed state after hydration</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

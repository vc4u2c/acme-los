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
import { SiteHeader } from '../../../components/web/site-header';
import { renderingDemoNavigationItems } from '../navigation';

export default function ClientRenderingDemoPage() {
  const [count, setCount] = React.useState(0);
  const [mountedAt, setMountedAt] = React.useState('');
  const [browserTime, setBrowserTime] = React.useState('');
  const [timeZone, setTimeZone] = React.useState('');
  const [viewport, setViewport] = React.useState('');
  const [hydrationState, setHydrationState] = React.useState(
    'Awaiting browser hydration',
  );

  React.useEffect(() => {
    const updateClock = () => {
      setBrowserTime(
        new Intl.DateTimeFormat('en-US', {
          timeStyle: 'medium',
        }).format(new Date()),
      );
    };

    setMountedAt(
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date()),
    );
    setHydrationState('Hydrated in the browser');
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setViewport(`${window.innerWidth}px x ${window.innerHeight}px`);
    updateClock();

    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={renderingDemoNavigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Client rendering demo
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            This route is intentionally client-rendered.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Use this page to show what happens after hydration: browser-only
            values appear, the clock keeps moving, and interactions update
            without another request.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Hydrated client state
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Live browser updates happen here.
              </CardTitle>
              <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                This route still starts with server-sent HTML, but the values
                below are filled in and updated by the browser after hydration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                    Hydration state
                  </p>
                  <p
                    data-testid="client-hydration-state"
                    className="mt-3 text-lg font-semibold text-[var(--foreground)]"
                  >
                    {hydrationState}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                    Mounted in browser
                  </p>
                  <p
                    data-testid="client-mounted-at"
                    className="mt-3 text-lg font-semibold text-[var(--foreground)]"
                  >
                    {mountedAt || 'Hydrating...'}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                    Browser clock
                  </p>
                  <p
                    data-testid="client-browser-time"
                    className="mt-3 text-lg font-semibold text-[var(--foreground)]"
                  >
                    {browserTime || 'Waiting for the browser clock...'}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                    Browser details
                  </p>
                  <p
                    data-testid="client-browser-details"
                    className="mt-3 text-base font-medium leading-7 text-[var(--foreground)]"
                  >
                    {timeZone && viewport
                      ? `${timeZone} | ${viewport}`
                      : 'Waiting for browser-only values...'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => setCount((value) => value + 1)}
                  className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
                >
                  Increment client counter
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCount(0)}
                  className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Demo checklist
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Client route talking points
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Counter value
                </p>
                <p
                  data-testid="client-counter-value"
                  className="mt-2 text-4xl font-display text-[var(--foreground)]"
                >
                  {count}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-base leading-8 text-[var(--muted-foreground)]">
                <p>
                  View Source still shows HTML because Next pre-renders the
                  shell.
                </p>
                <p className="mt-2">
                  Hydration turns that shell into a live React experience in the
                  browser.
                </p>
                <p className="mt-2">
                  The ISR demo route uses a 60-second revalidation window.
                </p>
                <p className="mt-2">
                  This route proves it with browser time, viewport details, and
                  interactive client state.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

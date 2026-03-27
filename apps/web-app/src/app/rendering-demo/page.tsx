import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from '../../components/web/site-header';
import { renderingDemoNavigationItems } from './navigation';

export const dynamic = 'force-static';

const demoCards = [
  {
    href: '/rendering-demo/static',
    eyebrow: 'Static',
    title: 'Static route',
    body: 'This route is explicitly force-static and shows a fixed timestamp that only changes on rebuild.',
  },
  {
    href: '/rendering-demo/isr',
    eyebrow: 'ISR',
    title: 'ISR route',
    body: 'This route revalidates every 60 seconds and shows a refresh timestamp dedicated to the demo.',
  },
  {
    href: '/rendering-demo/server',
    eyebrow: 'Server',
    title: 'Dynamic server route',
    body: 'This route renders on the server for every request so the timestamp changes on refresh.',
  },
  {
    href: '/rendering-demo/client',
    eyebrow: 'Client',
    title: 'Client rendering route',
    body: 'This route hydrates into live browser state with a counter and clock for the team demo.',
  },
];

export default function RenderingDemoIndexPage() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={renderingDemoNavigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Rendering strategy
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            One place to demo static, ISR, server, and client rendering.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Use this route to walk the team through the rendering split in the
            web app without context switching or guessing which page shows which
            behavior.
          </p>
        </div>

        <Card className="mt-8 rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
          <CardHeader>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Demo order
            </p>
            <CardTitle className="font-display text-3xl text-[var(--foreground)]">
              Show the rendering split in under two minutes
            </CardTitle>
            <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
              Start on the static route, move to ISR, refresh the server route,
              then show hydration and client state on the browser route.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {demoCards.map((card) => (
            <Card
              key={card.href}
              className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]"
            >
              <CardHeader>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                  {card.eyebrow}
                </p>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  {card.title}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                  {card.body}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={card.href}
                  className="inline-flex items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)]"
                >
                  Open route
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

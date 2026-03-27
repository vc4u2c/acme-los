import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from '../../../components/web/site-header';
import { renderingDemoNavigationItems } from '../navigation';

export const dynamic = 'force-static';

const generatedAt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
}).format(new Date());

export default function StaticRenderingDemoPage() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={renderingDemoNavigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Static rendering demo
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            This route is generated once and served as static HTML.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Refresh this route during the demo and the generated timestamp stays
            the same. It only changes on a rebuild or redeploy.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Build-time signal
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Static timestamp
              </CardTitle>
              <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                This value is baked into the page output and should not change
                on a normal refresh.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Generated at
                </p>
                <p
                  data-testid="static-generated-at"
                  className="mt-3 text-2xl font-display text-[var(--foreground)]"
                >
                  {generatedAt}
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
                What to point out
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-base leading-8 text-[var(--muted-foreground)]">
              <p>Refresh this route and the timestamp should stay fixed.</p>
              <p>Use this as the clean baseline for brochure-style content.</p>
              <p>
                Compare it next to the ISR route, which refreshes on a timer.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

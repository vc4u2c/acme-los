import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from '../../../components/web/site-header';
import { renderingDemoNavigationItems } from '../navigation';

export const revalidate = 60;

export default function IsrRenderingDemoPage() {
  const refreshedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={renderingDemoNavigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            ISR rendering demo
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            This route revalidates on a timed interval.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            Refresh this route within the 60-second window and the timestamp
            should stay stable. After revalidation, it updates without a full
            rebuild.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Revalidation signal
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                ISR timestamp
              </CardTitle>
              <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                This value is regenerated on the server when the ISR window
                expires.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                  Refreshed at
                </p>
                <p
                  data-testid="isr-refreshed-at"
                  className="mt-3 text-2xl font-display text-[var(--foreground)]"
                >
                  {refreshedAt}
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
              <p>
                Refresh inside the 60-second window and the value should hold.
              </p>
              <p>
                Refresh again after the window and the timestamp should update.
              </p>
              <p>This is the right example for semi-fresh content.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

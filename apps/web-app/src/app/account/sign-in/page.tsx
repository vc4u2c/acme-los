import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@acme-los/ui-web';
import { SiteHeader } from '../../../components/web/site-header';

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/support/contact', label: 'Support' },
  { href: '/legal/privacy', label: 'Privacy' },
];

export default function SignInPage() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="rounded-[2rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Customer portal
              </p>
              <CardTitle className="font-display text-4xl text-[var(--foreground)]">
                Sign in securely
              </CardTitle>
              <p className="text-base leading-8 text-[var(--muted-foreground)]">
                Use the customer portal to resume an application, review
                disclosures, and check funding updates without restarting.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Email
                </label>
                <Input className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Password
                </label>
                <Input type="password" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <Button className="w-full rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
                Sign in
              </Button>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                This is the portal shell for now. Account wiring comes next, but
                the navigation and trust framing are in place.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
              <CardHeader>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  What sign-in should support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-base leading-8 text-[var(--muted-foreground)]">
                <p>Resume the seven-step application without losing context.</p>
                <p>Review documents, disclosures, and funding status in one place.</p>
                <p>Keep identity and support actions separate from the main CTA flow.</p>
              </CardContent>
            </Card>

            <Card className="rounded-[1.9rem] border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
              <CardHeader>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  Need an account first?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                >
                  <Link href="/account/create-account">Create account</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

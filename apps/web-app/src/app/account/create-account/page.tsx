import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@acme-los/ui-web';
import { SiteHeader } from '../../../components/web/site-header';

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/support/contact', label: 'Support' },
  { href: '/legal/privacy', label: 'Privacy' },
];

export default function CreateAccountPage() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr]">
          <Card className="rounded-[2rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Account setup
              </p>
              <CardTitle className="font-display text-4xl text-[var(--foreground)]">
                Create your customer login
              </CardTitle>
              <p className="text-base leading-8 text-[var(--muted-foreground)]">
                Set up a secure profile so the application, disclosures, and
                funding updates can live in one account.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  First name
                </label>
                <Input className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Last name
                </label>
                <Input className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Email
                </label>
                <Input type="email" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Mobile phone
                </label>
                <Input className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  Password
                </label>
                <Input type="password" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-[var(--foreground)]" />
              </div>
              <div className="md:col-span-2 space-y-3">
                <Button className="w-full rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
                  Create account
                </Button>
                <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                  The secure account experience is still a shell, but this page
                  gives the navbar and footer a credible account path today.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.9rem] border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Returning applicants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-base leading-8 text-[var(--foreground)]">
              <p>Already have a customer login? Head to the secure sign-in page instead.</p>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
              >
                <Link href="/account/sign-in">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

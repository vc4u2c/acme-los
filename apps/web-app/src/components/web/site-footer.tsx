import Link from 'next/link';
import { applicationSteps } from './apply/step-definitions';
import { webAppRelease } from '../../lib/app-release';
import { AcmeMarkIcon } from './icons';

const quickLinks = [
  { href: '/', label: 'Home' },
  { href: '/rendering-demo', label: 'Rendering demo' },
  { href: '/account/sign-in', label: 'Sign in' },
  { href: '/account/create-account', label: 'Create account' },
  { href: '/showcase', label: 'Showcase' },
];

const legalLinks = [
  { href: '/rates-terms', label: 'Rates and terms' },
  { href: '/legal/privacy', label: 'Privacy notice' },
  { href: '/legal/terms', label: 'Terms of use' },
  { href: '/legal/accessibility', label: 'Accessibility' },
  { href: '/legal/licenses', label: 'State licenses' },
];

export function SiteFooter(): React.ReactElement {
  return (
    <footer className="border-t border-[var(--border)] bg-[color:var(--surface)/0.94] text-[var(--foreground)]">
      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-12">
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Call support
            </p>
            <a
              href="tel:+18334102746"
              className="mt-3 block font-display text-3xl text-[var(--foreground)]"
            >
              (833) 410-2746
            </a>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              Mon-Fri 8:00 AM to 8:00 PM CT
              <br />
              Sat 9:00 AM to 5:00 PM CT
            </p>
          </div>

          <div className="rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Email support
            </p>
            <a
              href="mailto:support@acme-los.dev"
              className="mt-3 block font-display text-3xl text-[var(--foreground)]"
            >
              support@acme-los.dev
            </a>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              Use email for document questions, portal access issues, and
              non-urgent funding follow-up.
            </p>
          </div>

          <div className="rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Mailing address
            </p>
            <p className="mt-3 font-display text-3xl text-[var(--foreground)]">
              Dallas, TX
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              ACME LOS Support Center
              <br />
              1201 Commerce Row, Suite 400
              <br />
              Dallas, Texas 75201
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.85fr_0.85fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)]">
                <AcmeMarkIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
                  ACME LOS
                </p>
                <p className="font-display text-2xl">Installment flow</p>
              </div>
            </div>
            <p className="max-w-xl text-base leading-8 text-[var(--muted-foreground)]">
              A cleaner installment flow with visible support, clearer
              disclosures, and steadier progress from first click through
              funding.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Journey
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {applicationSteps.map((step, index) => (
                <span
                  key={step.slug}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-medium text-[var(--foreground)]"
                >
                  {index + 1}. {step.shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Account
            </p>
            <div className="mt-4 space-y-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Legal and support
            </p>
            <div className="mt-4 space-y-3">
              <Link
                href="/support/contact"
                className="block rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)]"
              >
                Contact support
              </Link>
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-[1.3rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted-foreground)] md:flex-row md:items-center md:justify-between">
          <p>
            Built for responsive intake, clearer disclosures, visible support,
            and steadier conversion.
          </p>
          <div className="flex flex-col gap-1 text-left md:items-end md:text-right">
            <p>
              Copyright {new Date().getFullYear()} ACME LOS. All rights
              reserved.
            </p>
            <div className="inline-flex items-center rounded-full border border-[var(--accent)] bg-[var(--surface-spot)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-ink)]">
              {webAppRelease.versionBadgeLabel}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

import Link from 'next/link';
import {
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { webAppRelease } from '../../lib/app-release';
import { isSecurityInspectorEnabled } from '../../lib/security-demo';
import { AcmeMarkIcon } from './icons';

const baseQuickLinks = [
  { href: '/', label: 'Home' },
  { href: '/apply/personal-info', label: 'Application' },
  { href: '/account/profile', label: 'Customer dashboard' },
  { href: '/rendering-demo', label: 'Rendering demo' },
  { href: '/showcase', label: 'Showcase' },
];

const legalLinks = [
  { href: '/rates-terms', label: 'Rates and terms' },
  { href: '/legal/privacy', label: 'Privacy notice' },
  { href: '/legal/terms', label: 'Terms of use' },
  { href: '/legal/accessibility', label: 'Accessibility' },
  { href: '/legal/licenses', label: 'State licenses' },
];

const socialChannels: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'LinkedIn', icon: Linkedin },
  { label: 'Instagram', icon: Instagram },
  { label: 'Facebook', icon: Facebook },
  { label: 'YouTube', icon: Youtube },
];

const footerNavLinkClassName =
  'block w-full rounded-[1.15rem] border border-[var(--border-strong)] bg-[var(--surface-strong)] px-3.5 py-2.5 text-[15px] font-medium text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] hover:shadow-[0_12px_24px_var(--shadow-soft)] lg:max-w-[15.5rem] lg:px-3 lg:py-2 lg:text-sm';

export function SiteFooter(): React.ReactElement {
  const quickLinks = isSecurityInspectorEnabled()
    ? [...baseQuickLinks, { href: '/security', label: 'Security demo' }]
    : baseQuickLinks;

  return (
    <footer className="border-t border-[var(--border)] bg-[color:var(--surface)/0.94] text-[var(--foreground)]">
      <div className="site-shell py-10 lg:py-12">
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[1.8rem] border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)/0.96] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
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

          <div className="rounded-[1.8rem] border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)/0.96] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
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

          <div className="rounded-[1.8rem] border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)/0.96] p-5 shadow-lg shadow-[color:var(--shadow-soft)]">
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

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.9fr_1fr]">
          <div className="space-y-5">
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
              A steadier lending experience with visible support, clearer
              disclosures, and cleaner pacing from the first step through
              funding.
            </p>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Stay connected
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {socialChannels.map((channel) => {
                  const Icon = channel.icon;

                  return (
                    <span
                      key={channel.label}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)/0.96] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)]"
                    >
                      <Icon
                        className="h-4 w-4 text-[var(--brand)]"
                        aria-hidden="true"
                      />
                      {channel.label}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--muted-foreground)]">
                Follow product updates, customer education, and service notices
                across our official channels.
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Explore
            </p>
            <div className="mt-4 flex flex-col items-start gap-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={footerNavLinkClassName}
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
            <div className="mt-4 flex flex-col items-start gap-3">
              <Link href="/support/contact" className={footerNavLinkClassName}>
                Contact support
              </Link>
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={footerNavLinkClassName}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted-foreground)]">
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:gap-3">
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--accent)] bg-[var(--surface-spot)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-ink)]">
                {webAppRelease.versionBadgeLabel}
              </div>
              <p>
                &copy; {new Date().getFullYear()} ACME LOS. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

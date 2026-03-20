'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@acme-los/ui-web';
import { AcmeMarkIcon, MenuIcon } from './icons';
import { ProfileMenu } from './profile-menu';
import { SiteAlertStrip } from './site-alert-strip';
import { ThemeToggle } from './theme-toggle';

type NavItem = {
  href: string;
  label: string;
};

const utilityLinks = [
  { href: '/rates-terms', label: 'Rates & terms' },
  { href: '/legal/licenses', label: 'State licenses' },
  { href: '/support/contact', label: 'Contact support' },
];

export function SiteHeader({
  items,
  variant = 'default',
}: {
  items: NavItem[];
  variant?: 'default' | 'application';
}): React.ReactElement {
  const pathname = usePathname();
  const showMarketingNav = variant !== 'application';

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--surface)/0.9] backdrop-blur-xl">
      <SiteAlertStrip />
      {showMarketingNav ? (
        <div className="hidden border-b border-[var(--border)] bg-[color:var(--surface-strong)/0.88] md:block">
          <div className="site-shell flex items-center justify-between gap-4 py-2.5 text-xs">
            <div className="flex items-center gap-4 text-[var(--muted-foreground)]">
              <span className="font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                Customer support
              </span>
              <a
                href="tel:+18334102746"
                className="font-semibold text-[var(--foreground)] transition hover:text-[var(--brand)]"
              >
                (833) 410-2746
              </a>
              <span className="hidden xl:inline">
                Mon-Fri 8:00 AM to 8:00 PM CT
              </span>
            </div>

            <div className="flex items-center gap-4 text-[var(--muted-foreground)]">
              {utilityLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-medium transition hover:text-[var(--foreground)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="site-shell flex items-center justify-between gap-3 py-2.5 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] sm:h-10 sm:w-10">
            <AcmeMarkIcon className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
          </span>
          <span className="min-w-0">
            <span className="font-display text-base leading-none text-[var(--foreground)] sm:hidden">
              ACME LOS
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted-foreground)] sm:text-sm">
                ACME LOS
              </span>
              <span className="font-display text-xl leading-none text-[var(--foreground)]">
                Installment flow
              </span>
            </span>
          </span>
        </Link>

        {showMarketingNav ? (
          <nav className="hidden items-center gap-7 text-sm font-medium text-[var(--muted-foreground)] lg:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'transition hover:text-[var(--foreground)]',
                  item.href.startsWith('/') &&
                  (pathname === item.href ||
                    pathname.startsWith(`${item.href}/`))
                    ? 'text-[var(--foreground)]'
                    : '',
                ].join(' ')}
                aria-current={
                  item.href.startsWith('/') &&
                  (pathname === item.href ||
                    pathname.startsWith(`${item.href}/`))
                    ? 'page'
                    : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="hidden flex-1 lg:block" />
        )}

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <ProfileMenu />
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <ProfileMenu />
          {showMarketingNav ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-9 rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-0 text-[var(--foreground)] hover:bg-[var(--surface-strong)] sm:h-10 sm:w-10"
                  aria-label="Open navigation menu"
                >
                  <MenuIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
              >
                <SheetHeader>
                  <SheetTitle className="font-display text-[var(--foreground)]">
                    Customer navigation
                  </SheetTitle>
                  <SheetDescription className="text-[var(--muted-foreground)]">
                    Reach support, review rates, or go straight into the
                    application.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-8 space-y-6">
                  <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface-accent)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                      Support now
                    </p>
                    <a
                      href="tel:+18334102746"
                      className="mt-2 block font-display text-2xl text-[var(--foreground)]"
                    >
                      (833) 410-2746
                    </a>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                      Mon-Fri 8:00 AM to 8:00 PM CT
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                      Explore
                    </p>
                    {items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          'block rounded-2xl border px-4 py-3 text-sm font-medium transition',
                          item.href.startsWith('/') &&
                          (pathname === item.href ||
                            pathname.startsWith(`${item.href}/`))
                            ? 'border-[var(--brand)] bg-[var(--surface-accent)] text-[var(--foreground)]'
                            : 'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--brand)]',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                      Support and legal
                    </p>
                    {utilityLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>
    </header>
  );
}

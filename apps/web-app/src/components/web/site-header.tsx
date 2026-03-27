'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@acme-los/ui-web';
import { AcmeMarkIcon, MenuIcon, XIcon } from './icons';
import { ProfileMenu } from './profile-menu';
import { SiteAlertStrip } from './site-alert-strip';
import { ThemeToggle } from './theme-toggle';

type NavItem = {
  href: string;
  label: string;
  match?: 'exact' | 'prefix';
};

const utilityLinks = [
  { href: '/rates-terms', label: 'Rates & terms' },
  { href: '/legal/licenses', label: 'State licenses' },
  { href: '/support/contact', label: 'Contact support' },
];

function isPathActive(
  pathname: string,
  href: string,
  match: NavItem['match'] = 'prefix',
): boolean {
  if (match === 'exact') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({
  items,
  variant = 'default',
}: {
  items: readonly NavItem[];
  variant?: 'default' | 'application';
}): React.ReactElement {
  const pathname = usePathname();
  const showMarketingNav = variant !== 'application';
  const [activeHash, setActiveHash] = React.useState<string | null>(null);
  const headerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!showMarketingNav) {
      return;
    }

    const hashItems = items.filter((item) => item.href.startsWith('#'));
    if (!hashItems.length) {
      return;
    }

    const sections = hashItems
      .map((item) => {
        const id = item.href.slice(1);
        const element = document.getElementById(id);

        return element ? { href: item.href, element } : null;
      })
      .filter((item): item is { href: string; element: HTMLElement } =>
        Boolean(item),
      );

    if (!sections.length) {
      return;
    }

    const updateActiveHash = () => {
      const headerOffset =
        (headerRef.current?.getBoundingClientRect().height ?? 160) + 16;
      const current = sections
        .filter(
          ({ element }) => element.getBoundingClientRect().top <= headerOffset,
        )
        .at(-1);

      setActiveHash(current?.href ?? null);
    };

    updateActiveHash();
    window.addEventListener('scroll', updateActiveHash, { passive: true });
    window.addEventListener('resize', updateActiveHash);
    window.addEventListener('hashchange', updateActiveHash);

    return () => {
      window.removeEventListener('scroll', updateActiveHash);
      window.removeEventListener('resize', updateActiveHash);
      window.removeEventListener('hashchange', updateActiveHash);
    };
  }, [items, showMarketingNav]);

  React.useEffect(() => {
    const header = headerRef.current;
    if (!header) {
      return;
    }

    const syncHeaderOffset = () => {
      document.documentElement.style.setProperty(
        '--site-header-offset',
        `${header.getBoundingClientRect().height}px`,
      );
    };

    syncHeaderOffset();

    window.addEventListener('resize', syncHeaderOffset);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', syncHeaderOffset);
      };
    }

    const resizeObserver = new ResizeObserver(syncHeaderOffset);
    resizeObserver.observe(header);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncHeaderOffset);
    };
  }, []);

  const isActiveItem = React.useCallback(
    (item: NavItem) => {
      if (item.href.startsWith('#')) {
        return activeHash === item.href;
      }

      return isPathActive(pathname, item.href, item.match);
    },
    [activeHash, pathname],
  );

  const handleBrandClick = React.useCallback<
    React.MouseEventHandler<HTMLAnchorElement>
  >(
    (event) => {
      if (pathname !== '/' || variant === 'application') {
        return;
      }

      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [pathname, variant],
  );

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--surface)/0.9] backdrop-blur-xl"
    >
      <SiteAlertStrip />
      {showMarketingNav ? (
        <div className="hidden border-b border-[var(--border)] bg-[color:var(--surface-strong)/0.88] lg:block">
          <div className="site-shell flex items-center justify-between gap-4 py-2.5 text-xs">
            <div className="flex items-center gap-4 text-[var(--foreground)]">
              <span className="font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                Customer support
              </span>
              <a
                href="tel:+18334102746"
                className="font-semibold text-[var(--foreground)] transition hover:text-[var(--brand)]"
              >
                (833) 410-2746
              </a>
              <span className="hidden font-medium text-[var(--muted-foreground)] xl:inline">
                Mon-Fri 8:00 AM to 8:00 PM CT
              </span>
            </div>

            <div className="flex items-center gap-4">
              {utilityLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'rounded-full px-2.5 py-1 font-semibold transition',
                    isActiveItem(item)
                      ? 'border border-[var(--brand)] bg-[var(--surface-accent)] text-[var(--brand-strong)] opacity-100 shadow-sm'
                      : 'border border-transparent text-[var(--foreground)] opacity-80 hover:border-[var(--border)] hover:bg-[var(--surface)] hover:opacity-100',
                  ].join(' ')}
                  aria-current={isActiveItem(item) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="site-shell flex items-center justify-between gap-3 py-2.5 sm:py-4">
        <Link
          href="/"
          onClick={handleBrandClick}
          className="flex min-w-0 items-center gap-2.5 sm:gap-3"
        >
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
          <nav className="hidden items-center gap-8 text-[15px] font-semibold text-[var(--foreground)] lg:flex xl:gap-9 xl:text-base">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'opacity-80 transition hover:opacity-100',
                  isActiveItem(item)
                    ? 'text-[var(--brand)] opacity-100'
                    : 'text-[var(--foreground)]',
                ].join(' ')}
                aria-current={isActiveItem(item) ? 'page' : undefined}
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
                className="border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)]"
              >
                <SheetHeader className="gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <SheetTitle className="font-display text-[var(--foreground)]">
                        Customer navigation
                      </SheetTitle>
                      <SheetDescription className="text-[var(--muted-foreground)]">
                        Reach support, review rates, or go straight into the
                        application.
                      </SheetDescription>
                    </div>
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm transition hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                        aria-label="Close navigation menu"
                      >
                        <XIcon className="h-4.5 w-4.5" />
                      </button>
                    </SheetClose>
                  </div>
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
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={[
                            'block rounded-2xl border px-4 py-3 text-sm font-medium transition',
                            isActiveItem(item)
                              ? 'border-[var(--brand)] bg-[var(--surface-accent)] text-[var(--foreground)]'
                              : 'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--brand)]',
                          ].join(' ')}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                      Support and legal
                    </p>
                    {utilityLinks.map((item) => (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={[
                            'block rounded-2xl border px-4 py-3 text-sm font-medium transition',
                            isActiveItem(item)
                              ? 'border-[var(--brand)] bg-[var(--surface-accent)] text-[var(--foreground)]'
                              : 'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--brand)]',
                          ].join(' ')}
                          aria-current={isActiveItem(item) ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
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

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { InfoIcon, XIcon } from './icons';

const dismissalKey = 'acme-los-site-alert-dismissed-v2';

export function SiteAlertStrip(): React.ReactElement | null {
  const pathname = usePathname();
  const [isDismissed, setIsDismissed] = React.useState(false);

  React.useEffect(() => {
    const wasDismissed = window.sessionStorage.getItem(dismissalKey) === 'true';
    setIsDismissed(wasDismissed);
  }, []);

  const dismiss = React.useCallback(() => {
    window.sessionStorage.setItem(dismissalKey, 'true');
    setIsDismissed(true);
  }, []);

  const scrollToTop = React.useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBannerIconClick = React.useCallback<
    React.MouseEventHandler<HTMLButtonElement>
  >(
    (event) => {
      if (pathname !== '/') {
        return;
      }

      event.preventDefault();
      scrollToTop();
    },
    [pathname, scrollToTop],
  );

  if (isDismissed) {
    return null;
  }

  return (
    <div className="relative bg-[var(--brand)] text-[var(--brand-contrast)] before:pointer-events-none before:absolute before:bottom-0 before:left-4 before:right-4 before:h-3 before:content-[''] before:bg-[linear-gradient(180deg,rgba(248,255,249,0.16),transparent)] before:opacity-80 before:blur-md after:pointer-events-none after:absolute after:bottom-0 after:left-4 after:right-4 after:h-px after:content-[''] after:bg-[linear-gradient(90deg,transparent,rgba(248,255,249,0.34),transparent)] sm:before:left-6 sm:before:right-6 sm:after:left-6 sm:after:right-6 lg:before:left-8 lg:before:right-8 lg:after:left-8 lg:after:right-8">
      <div className="site-shell flex items-center justify-between gap-2 py-1 text-[10.5px] sm:py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={handleBannerIconClick}
            aria-label={
              pathname === '/' ? 'Scroll to top' : 'Alert information'
            }
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--alert-info-badge-border)] bg-[var(--alert-info-badge-bg)] text-[var(--alert-info-badge-fg)] shadow-sm shadow-[color:rgba(13,83,56,0.16)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(248,255,249,0.72)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand)] sm:h-5 sm:w-5"
          >
            <InfoIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
          <p className="truncate leading-5 text-[var(--brand-contrast)]">
            Applications approved after 6:00 PM CT may fund the next business
            day.
          </p>
          <Link
            href="/rates-terms"
            className="hidden whitespace-nowrap font-semibold text-[var(--brand-contrast)] underline decoration-[color:rgba(248,255,249,0.45)] underline-offset-4 transition hover:decoration-[var(--brand-contrast)] sm:inline"
          >
            Review rates and timing
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss alert"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(248,255,249,0.45)] bg-[color:rgba(248,255,249,0.12)] text-[var(--brand-contrast)] transition hover:bg-[color:rgba(248,255,249,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(248,255,249,0.72)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand)] sm:h-6 sm:w-6"
        >
          <XIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      </div>
    </div>
  );
}

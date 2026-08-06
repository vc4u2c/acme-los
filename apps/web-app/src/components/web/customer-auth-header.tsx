import Link from 'next/link';
import * as React from 'react';
import { AcmeMarkIcon } from './icons';
import { ThemeToggle } from './theme-toggle';

export function CustomerAuthHeader({
  action,
}: {
  action?: { href: string; label: string };
}): React.ReactElement {
  return (
    <header className="border-b border-[var(--border)] bg-[color:var(--surface)/0.92] backdrop-blur-xl">
      <div className="site-shell flex items-center justify-between gap-3 py-2.5 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] sm:h-10 sm:w-10">
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
        <div className="flex items-center gap-3">
          {action ? (
            <Link
              href={action.href}
              className="text-sm font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline"
            >
              {action.label}
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

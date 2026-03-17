'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@acme-los/ui-web';
import { ChevronDownIcon, UserCircleIcon } from './icons';

const accountLinks = [
  {
    href: '/account/sign-in',
    label: 'Sign in',
    description: 'Resume an application or view updates.',
  },
  {
    href: '/account/create-account',
    label: 'Create account',
    description: 'Set up a secure customer login.',
  },
];

const supportLinks = [
  {
    href: '/support/contact',
    label: 'Contact support',
    description: 'Get help with documents or funding.',
  },
  {
    href: '/rates-terms',
    label: 'Rates and terms',
    description: 'See pricing and funding expectations.',
  },
];

function MenuCopy({
  label,
  description,
}: {
  label: string;
  description: string;
}): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">
        {description}
      </p>
    </div>
  );
}

export function ProfileMenu(): React.ReactElement {
  const router = useRouter();

  const signOut = React.useCallback(() => {
    window.localStorage.removeItem('acme-los-installment-draft');
    window.localStorage.removeItem('acme-los-theme');
    document.documentElement.dataset.theme = 'light';
    router.push('/');
  }, [router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open profile menu"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 shadow-sm transition hover:border-[var(--brand)] hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] sm:h-10 sm:px-3"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-accent)] text-[var(--brand)] sm:h-7 sm:w-7">
            <UserCircleIcon className="h-4 w-4" />
          </span>
          <ChevronDownIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-72 max-w-[calc(100vw-1rem)] rounded-[1.25rem] border border-[var(--border-strong)] bg-[var(--surface-strong)] p-2 text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:w-[18rem]"
      >
        <DropdownMenuLabel className="px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          Account
        </DropdownMenuLabel>
        {accountLinks.map((item) => (
          <DropdownMenuItem
            key={item.href}
            asChild
            className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] focus:bg-[var(--surface-accent)]"
          >
            <Link href={item.href}>
              <MenuCopy label={item.label} description={item.description} />
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="mx-1 my-2 bg-[var(--border)]" />

        <DropdownMenuLabel className="px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          Support
        </DropdownMenuLabel>
        {supportLinks.map((item) => (
          <DropdownMenuItem
            key={item.href}
            asChild
            className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] focus:bg-[var(--surface-accent)]"
          >
            <Link href={item.href}>
              <MenuCopy label={item.label} description={item.description} />
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="mx-1 my-2 bg-[var(--border)]" />

        <DropdownMenuItem
          onSelect={signOut}
          className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] focus:bg-[var(--surface-accent)]"
        >
          <MenuCopy
            label="Sign out"
            description="Clear the local customer session shell and return to home."
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

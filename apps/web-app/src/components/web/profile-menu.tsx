'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuthSession } from '@acme-los/auth/web';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@acme-los/ui-web';
import {
  ChevronDownIcon,
  ClipboardIcon,
  LogInIcon,
  LogOutIcon,
  SupportIcon,
  UserCircleIcon,
} from './icons';

const signedOutAccountLinks = [
  {
    label: 'Sign in',
    description: 'Sign in or create an account in the secure customer portal.',
    returnTo: '/account/profile',
  },
];

const supportLinks = [
  {
    href: '/support/contact',
    label: 'Contact support',
    description: 'Get help with documents or funding.',
    icon: SupportIcon,
  },
  {
    href: '/rates-terms',
    label: 'Rates and terms',
    description: 'See pricing and funding expectations.',
    icon: ClipboardIcon,
  },
];

function MenuCopy({
  label,
  description,
  icon: Icon,
}: {
  label: string;
  description: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-accent)] text-[var(--brand)]">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </p>
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
    </div>
  );
}

export function ProfileMenu(): React.ReactElement {
  const { session, signIn, signOut } = useAuthSession();
  const isAuthenticated = session.status === 'authenticated';
  const accountLinks = isAuthenticated
    ? [
        {
          href: '/account/profile',
          label: 'Customer dashboard',
          description: 'Update contact details and address information.',
          icon: UserCircleIcon,
        },
        {
          href: '/apply/personal-info',
          label: 'Continue application',
          description: 'Return to the guarded application shell.',
          icon: ClipboardIcon,
        },
      ]
    : signedOutAccountLinks.map((item) => ({
        ...item,
        icon: LogInIcon,
      }));

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
        className="w-72 max-w-[calc(100vw-1rem)] sm:w-[18rem]"
      >
        <DropdownMenuLabel>
          {isAuthenticated && session.user ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {session.user.displayName}
              </p>
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                {session.user.email ?? 'Authenticated customer session'}
              </p>
            </div>
          ) : (
            'Account'
          )}
        </DropdownMenuLabel>
        {isAuthenticated
          ? accountLinks.map((item) => (
              <DropdownMenuItem key={item.href} asChild className="px-3 py-2.5">
                <Link href={item.href}>
                  <MenuCopy
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                  />
                </Link>
              </DropdownMenuItem>
            ))
          : signedOutAccountLinks.map((item) => (
              <DropdownMenuItem
                key={item.label}
                className="px-3 py-2.5 cursor-pointer"
                onSelect={() => {
                  void signIn({
                    returnTo: item.returnTo,
                  });
                }}
              >
                <MenuCopy
                  label={item.label}
                  description={item.description}
                  icon={LogInIcon}
                />
              </DropdownMenuItem>
            ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Support</DropdownMenuLabel>
        {supportLinks.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="px-3 py-2.5">
            <Link href={item.href}>
              <MenuCopy
                label={item.label}
                description={item.description}
                icon={item.icon}
              />
            </Link>
          </DropdownMenuItem>
        ))}

        {isAuthenticated ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void signOut();
              }}
              className="px-3 py-2.5"
            >
              <MenuCopy
                label="Sign out"
                description="Close the customer session and return to home."
                icon={LogOutIcon}
              />
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

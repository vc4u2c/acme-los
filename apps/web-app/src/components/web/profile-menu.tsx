'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ClipboardList,
  FileText,
  KeyRound,
  LifeBuoy,
  LogOut,
  LayoutDashboard,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuthSession } from '@acme-los/auth/web';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@acme-los/ui-web';

type MenuLink = {
  href?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  activePrefixes?: string[];
  returnTo?: string;
};

const signedOutAccountLinks: MenuLink[] = [
  {
    label: 'Sign in',
    description: 'Sign in or create an account in the secure customer portal.',
    icon: KeyRound,
    returnTo: '/account/profile',
  },
];

const supportLinks: MenuLink[] = [
  {
    href: '/support/contact',
    label: 'Contact support',
    description: 'Get help with documents or funding.',
    icon: LifeBuoy,
    activePrefixes: ['/support/contact'],
  },
  {
    href: '/rates-terms',
    label: 'Rates and terms',
    description: 'See pricing and funding expectations.',
    icon: FileText,
    activePrefixes: ['/rates-terms'],
  },
];

function isPathActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function MenuCopy({
  label,
  description,
  icon: Icon,
  isActive = false,
}: {
  label: string;
  description: string;
  icon?: LucideIcon;
  isActive?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <span
          className={[
            'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-150',
            isActive
              ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] group-data-[highlighted]:border-[var(--brand)] group-data-[highlighted]:bg-[var(--brand)] group-data-[highlighted]:text-[var(--brand-contrast)]',
          ].join(' ')}
        >
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2} />
        </span>
      ) : null}
      <div className="space-y-0.5">
        <p
          className={[
            'text-sm font-semibold',
            isActive ? 'text-[var(--brand)]' : 'text-[var(--foreground)]',
          ].join(' ')}
        >
          {label}
        </p>
        <p
          className={[
            'text-xs leading-5 transition-colors',
            isActive
              ? 'text-[var(--foreground)]'
              : 'text-[var(--muted-foreground)] group-data-[highlighted]:text-[var(--foreground)]',
          ].join(' ')}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

export function ProfileMenu(): React.ReactElement {
  const pathname = usePathname();
  const { session, signIn, signOut } = useAuthSession();
  const isAuthenticated = session.status === 'authenticated';
  const accountLinks: MenuLink[] = isAuthenticated
    ? [
        {
          href: '/account/profile',
          label: 'Customer dashboard',
          description: 'Update contact details and address information.',
          icon: LayoutDashboard,
          activePrefixes: ['/account/profile'],
        },
        {
          href: '/apply/personal-info',
          label: 'Continue application',
          description: 'Return to the guarded application shell.',
          icon: ClipboardList,
          activePrefixes: ['/apply'],
        },
      ]
    : signedOutAccountLinks;

  const isItemActive = React.useCallback(
    (item: MenuLink) => {
      if (!item.href) {
        return false;
      }

      return isPathActive(pathname, item.activePrefixes ?? [item.href]);
    },
    [pathname],
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open profile menu"
          className="group inline-flex h-9 cursor-pointer appearance-none items-center gap-1.5 rounded-full border border-[var(--border)] bg-[color:var(--surface)/0.92] px-2.5 shadow-[0_10px_22px_var(--shadow-soft)] outline-none transition duration-150 hover:border-[var(--brand)] hover:bg-[var(--surface-strong)] hover:shadow-[0_0_0_1px_var(--brand),0_10px_22px_var(--shadow-soft)] focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)] sm:h-10 sm:px-3 lg:h-11 lg:gap-2 lg:px-3.5 [-webkit-tap-highlight-color:transparent]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--brand)] shadow-sm sm:h-7 sm:w-7 lg:h-8 lg:w-8">
            <UserRound
              className="h-[18px] w-[18px] lg:h-5 lg:w-5"
              strokeWidth={2}
            />
          </span>
          <ChevronDown
            className="h-4 w-4 text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)] lg:h-[18px] lg:w-[18px]"
            strokeWidth={2}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-72 max-h-[min(40rem,calc(100dvh-1rem))] max-w-[calc(100vw-1rem)] sm:w-[18rem]"
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
          ? accountLinks.map((item) => {
              if (!item.href) {
                return null;
              }

              const isActive = isItemActive(item);

              return (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className={[
                    'px-3 py-2.5',
                    isActive
                      ? 'border-[var(--brand)] bg-[var(--surface-accent)] shadow-[0_12px_26px_var(--shadow-soft)]'
                      : '',
                  ].join(' ')}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <MenuCopy
                      label={item.label}
                      description={item.description}
                      icon={item.icon}
                      isActive={isActive}
                    />
                  </Link>
                </DropdownMenuItem>
              );
            })
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
                  icon={item.icon}
                />
              </DropdownMenuItem>
            ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Support</DropdownMenuLabel>
        {supportLinks.map((item) => {
          if (!item.href) {
            return null;
          }

          const isActive = isItemActive(item);

          return (
            <DropdownMenuItem
              key={item.href}
              asChild
              className={[
                'px-3 py-2.5',
                isActive
                  ? 'border-[var(--brand)] bg-[var(--surface-accent)] shadow-[0_12px_26px_var(--shadow-soft)]'
                  : '',
              ].join(' ')}
            >
              <Link href={item.href}>
                <MenuCopy
                  label={item.label}
                  description={item.description}
                  icon={item.icon}
                  isActive={isActive}
                />
              </Link>
            </DropdownMenuItem>
          );
        })}

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
                icon={LogOut}
              />
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

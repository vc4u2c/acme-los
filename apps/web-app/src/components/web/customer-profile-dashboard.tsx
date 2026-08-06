'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  KeyRound,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
import { useAuthSession } from '@acme-los/auth/web';
import { Alert, AlertDescription, AlertTitle, Button } from '@acme-los/ui-web';
import {
  buildAccountSecurityStepUpUrl,
  type AccountSecurityActionId,
} from '../../lib/okta-account-actions';
import { SiteHeader } from './site-header';
import type { CustomerProfile } from '@acme-los/api/contracts';

type CustomerProfileFormState = CustomerProfile;

const emptyCustomerProfile: CustomerProfileFormState = {
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
};

const navigationItems: { href: string; label: string }[] = [];

const oktaAccountSecurityActions: Array<{
  actionId: AccountSecurityActionId;
  label: string;
  description: string;
  cta: string;
  icon: LucideIcon;
}> = [
  {
    actionId: 'password',
    label: 'Change password',
    description:
      'Confirm your current password and a code sent by text message.',
    cta: 'Change password',
    icon: KeyRound,
  },
  {
    actionId: 'change-email',
    label: 'Change email',
    description: 'Confirm your password and phone, then verify the new email.',
    cta: 'Change email',
    icon: Mail,
  },
  {
    actionId: 'change-phone',
    label: 'Change phone',
    description: 'Confirm your password and email, then verify the new phone.',
    cta: 'Change phone',
    icon: Phone,
  },
];

const accountSecurityActionCompletionMessages: Record<
  AccountSecurityActionId,
  string
> = {
  password:
    'Password change completed. Sign in again with the new password to refresh the customer session.',
  'change-email':
    'Email change completed. Sign in again with the new email so ACME can sync the verified value.',
  'change-phone':
    'Phone change completed. Sign in again so ACME can refresh the verified session before funding.',
};

function isAccountSecurityActionId(
  value: string | null,
): value is AccountSecurityActionId {
  return (
    value === 'password' || value === 'change-email' || value === 'change-phone'
  );
}

function ReadOnlyProfileField({
  id,
  label,
  value,
  placeholder = 'Not on file',
  description,
}: {
  id: string;
  label: string;
  value?: string | null;
  placeholder?: string;
  description?: React.ReactNode;
}): React.ReactElement {
  const normalizedValue = value?.trim() ?? '';
  const displayValue = normalizedValue || placeholder;

  return (
    <div className="space-y-2">
      <span
        id={id}
        className="block text-sm font-medium text-[var(--foreground)]"
      >
        {label}
      </span>
      <div
        aria-labelledby={id}
        className={`min-h-10 cursor-default select-text break-words rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm leading-6 ${
          normalizedValue
            ? 'text-[var(--foreground)]'
            : 'text-[var(--muted-foreground)]'
        }`}
      >
        {displayValue}
      </div>
      {description ? (
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function CustomerProfileDashboard(): React.ReactElement {
  const { session } = useAuthSession();
  const user = session.user;
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [formState, setFormState] =
    React.useState<CustomerProfileFormState>(emptyCustomerProfile);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [accountActionMessage, setAccountActionMessage] = React.useState<
    string | null
  >(null);
  const [isProfileLoading, setIsProfileLoading] = React.useState(true);

  const loadCustomerProfile = React.useCallback(
    async (
      options: {
        isMounted?: () => boolean;
        showSuccessMessage?: boolean;
      } = {},
    ) => {
      const isMounted = options.isMounted ?? (() => true);

      if (!session.isAuthenticated) {
        if (isMounted()) {
          setFormState(emptyCustomerProfile);
          setIsProfileLoading(false);
        }
        return;
      }

      if (isMounted()) {
        setIsProfileLoading(true);
      }

      try {
        const response = await webApiClient.customer.getProfile();

        if (!isMounted()) {
          return;
        }

        setFormState({
          ...emptyCustomerProfile,
          ...response.profile,
          email: response.profile.email || user?.email || '',
        });
        setStatusMessage(
          options.showSuccessMessage
            ? 'Account details refreshed from the current verified session.'
            : null,
        );
      } catch (error) {
        if (!isMounted()) {
          return;
        }

        setFormState((currentState) => ({
          ...emptyCustomerProfile,
          ...currentState,
          email: currentState.email || user?.email || '',
        }));
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load the secure customer profile.',
        );
      } finally {
        if (isMounted()) {
          setIsProfileLoading(false);
        }
      }
    },
    [session.isAuthenticated, user?.email, webApiClient],
  );

  React.useEffect(() => {
    let isMounted = true;

    const loadIfMounted = async () => {
      await loadCustomerProfile({ isMounted: () => isMounted });
    };

    void loadIfMounted();

    return () => {
      isMounted = false;
    };
  }, [loadCustomerProfile]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const actionId = new URLSearchParams(window.location.search).get(
      'account_action',
    );

    if (isAccountSecurityActionId(actionId)) {
      setAccountActionMessage(
        accountSecurityActionCompletionMessages[actionId],
      );
    }
  }, []);

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} variant="application" />

      <section className="border-b border-[var(--border)]">
        <div className="site-shell flex flex-col gap-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:py-9">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
              Customer account
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
              Account details
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
              Review your verified profile and use protected actions for
              security changes.
            </p>
          </div>
          <Button asChild className="w-full rounded-md sm:w-auto">
            <Link href="/apply/personal-info">
              Continue application
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="site-shell py-7 sm:py-9">
        {statusMessage || accountActionMessage ? (
          <Alert className="mb-7 rounded-md border-[var(--border)] bg-[var(--surface-strong)]">
            <AlertTitle>Account status</AlertTitle>
            <AlertDescription>
              {accountActionMessage ?? statusMessage}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)] lg:gap-14">
          <section aria-labelledby="profile-details-title" className="min-w-0">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <h2
                  id="profile-details-title"
                  className="text-xl font-semibold"
                >
                  Profile
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  These fields are read-only.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 shrink-0 rounded-md"
                disabled={isProfileLoading}
                onClick={() =>
                  void loadCustomerProfile({ showSuccessMessage: true })
                }
                aria-label="Refresh account details"
                title="Refresh account details"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isProfileLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </Button>
            </div>

            <div className="space-y-6 pt-6" aria-busy={isProfileLoading}>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyProfileField
                  id="customer-first-name"
                  label="First name"
                  value={user?.firstName}
                />
                <ReadOnlyProfileField
                  id="customer-last-name"
                  label="Last name"
                  value={user?.lastName}
                />
                <ReadOnlyProfileField
                  id="customer-email"
                  label="Sign-in email"
                  value={formState.email}
                />
                <ReadOnlyProfileField
                  id="customer-phone"
                  label="Verified mobile phone"
                  value={formState.phone}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyProfileField
                  id="customer-street-address"
                  label="Street address"
                  value={formState.streetAddress}
                />
                <ReadOnlyProfileField
                  id="customer-address-line-2"
                  label="Address line 2"
                  value={formState.addressLine2}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1.1fr_0.7fr_0.7fr]">
                <ReadOnlyProfileField
                  id="customer-city"
                  label="City"
                  value={formState.city}
                />
                <ReadOnlyProfileField
                  id="customer-state"
                  label="State"
                  value={formState.state}
                />
                <ReadOnlyProfileField
                  id="customer-zip-code"
                  label="Zip code"
                  value={formState.zipCode}
                />
              </div>
            </div>
          </section>

          <aside className="min-w-0 space-y-10 lg:border-l lg:border-[var(--border)] lg:pl-10">
            <section aria-labelledby="security-actions-title">
              <div className="border-b border-[var(--border)] pb-4">
                <h2
                  id="security-actions-title"
                  className="text-xl font-semibold"
                >
                  Account security
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Each change requires fresh Okta verification.
                </p>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {oktaAccountSecurityActions.map((action) => {
                  const Icon = action.icon;
                  const actionUrl = buildAccountSecurityStepUpUrl(
                    action.actionId,
                  );

                  return (
                    <a
                      key={action.actionId}
                      href={actionUrl}
                      className="group flex items-start gap-3 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--brand)]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {action.label}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-[var(--muted-foreground)]">
                          {action.description}
                        </span>
                      </span>
                      <ArrowRight
                        className="mt-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </a>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="session-title">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2 id="session-title" className="text-sm font-semibold">
                    Signed in as {user?.displayName || 'Customer'}
                  </h2>
                  <p className="mt-1 break-all text-sm text-[var(--muted-foreground)]">
                    {user?.email || 'Authenticated customer session'}
                  </p>
                </div>
              </div>

              {user?.leadId || user?.customerId ? (
                <dl className="mt-5 space-y-3 border-t border-[var(--border)] pt-4 text-sm">
                  {user.leadId ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        Lead ID
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs">
                        {user.leadId}
                      </dd>
                    </div>
                  ) : null}
                  {user.customerId ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        Customer ID
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs">
                        {user.customerId}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

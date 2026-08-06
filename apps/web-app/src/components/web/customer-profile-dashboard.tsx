'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  KeyRound,
  Mail,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
import { getCurrentOktaTokenClaims, useAuthSession } from '@acme-los/auth/web';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
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
      'Confirm your password, complete phone/SMS verification and your secret hint, then set the new password.',
    cta: 'Change password',
    icon: KeyRound,
  },
  {
    actionId: 'change-email',
    label: 'Change email',
    description:
      'Confirm your password, complete phone/SMS verification, then verify the code sent to the new email.',
    cta: 'Change email',
    icon: Mail,
  },
  {
    actionId: 'change-phone',
    label: 'Change phone',
    description:
      'Confirm your password, complete email verification, then verify the code sent to the new phone.',
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

function formatDebugClaimValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function getDebugRows(
  claims: Record<string, unknown> | null,
): Array<{ label: string; value: string }> {
  if (!claims) {
    return [];
  }

  const entries: Array<{ label: string; value: unknown }> = [
    { label: 'Subject', value: claims.sub },
    { label: 'Lead ID', value: claims.lead_id ?? claims.leadId },
    { label: 'Customer ID', value: claims.customer_id ?? claims.customerId },
    { label: 'Audience', value: claims.aud },
    { label: 'Issuer', value: claims.iss },
    { label: 'Scopes', value: claims.scp },
    { label: 'AMR', value: claims.amr },
  ];

  return entries
    .filter(
      (entry) =>
        entry.value !== undefined && entry.value !== null && entry.value !== '',
    )
    .map((entry) => ({
      label: entry.label,
      value: formatDebugClaimValue(entry.value),
    }));
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
  const [tokenClaims, setTokenClaims] = React.useState<{
    idToken: Record<string, unknown> | null;
    accessToken: Record<string, unknown> | null;
  }>({ idToken: null, accessToken: null });
  const [formState, setFormState] =
    React.useState<CustomerProfileFormState>(emptyCustomerProfile);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [accountActionMessage, setAccountActionMessage] = React.useState<
    string | null
  >(null);
  const [showTokenDebug, setShowTokenDebug] = React.useState(false);
  const [isProfileLoading, setIsProfileLoading] = React.useState(true);
  const tokenDebugSupported =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'okta';

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
    if (!tokenDebugSupported || typeof window === 'undefined') {
      setShowTokenDebug(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    setShowTokenDebug(searchParams.get('token_debug') === '1');
  }, [tokenDebugSupported]);

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

  React.useEffect(() => {
    if (!showTokenDebug) {
      return;
    }

    const loadClaims = async () => {
      setTokenClaims(await getCurrentOktaTokenClaims());
    };

    void loadClaims();
  }, [showTokenDebug]);

  const idTokenDebugRows = React.useMemo(
    () => getDebugRows(tokenClaims.idToken),
    [tokenClaims.idToken],
  );
  const accessTokenDebugRows = React.useMemo(
    () => getDebugRows(tokenClaims.accessToken),
    [tokenClaims.accessToken],
  );

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} variant="application" />

      <section className="site-shell py-6 sm:py-8 lg:py-10">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-7">
          <Card className="min-w-0 rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:rounded-[2rem]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Customer dashboard
              </p>
              <CardTitle className="font-display text-[2rem] leading-tight text-[var(--foreground)] sm:text-[2.35rem] lg:text-4xl">
                Review your verified account.
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                Verified identity stays with Okta. This dashboard shows the
                current account record for review.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 p-5 sm:p-6 lg:p-8">
              <div className="space-y-8">
                {isProfileLoading ? (
                  <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                    Loading your secure profile details.
                  </div>
                ) : null}
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <ReadOnlyProfileField
                    id="customer-email"
                    label="Sign-in email"
                    value={formState.email}
                    description="Use protected verification before changing the login email, then refresh your session here so ACME can sync the verified value."
                  />
                  <ReadOnlyProfileField
                    id="customer-phone"
                    label="Verified SMS phone"
                    value={formState.phone}
                    description="Loaded from your verified Okta phone/SMS enrollment when available."
                  />
                </div>

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

                <Alert className="rounded-[1.4rem] border-[var(--border)] bg-[var(--surface-strong)] p-4 sm:p-5">
                  <AlertTitle className="text-sm text-[var(--foreground)]">
                    Read-only account record
                  </AlertTitle>
                  <AlertDescription className="text-[var(--muted-foreground)]">
                    Use the protected actions to change password, sign-in email,
                    or phone. ACME refreshes verified values after a fresh
                    secure session.
                  </AlertDescription>
                  {statusMessage ? (
                    <p className="mt-3 text-sm font-medium text-[var(--brand)]">
                      {statusMessage}
                    </p>
                  ) : null}
                  {accountActionMessage ? (
                    <p className="mt-3 text-sm font-medium text-[var(--brand)]">
                      {accountActionMessage}
                    </p>
                  ) : null}
                </Alert>

                <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      variant="outline"
                      className="w-full rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)] sm:w-auto"
                    >
                      <Link href="/apply/personal-info">
                        Continue application
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="min-w-0 rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)] sm:rounded-[1.9rem]">
              <CardHeader className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                  Account security
                </p>
                <CardTitle className="font-display text-[1.8rem] leading-tight text-[var(--foreground)] sm:text-3xl">
                  Protected actions.
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-[var(--muted-foreground)] sm:text-base sm:leading-7">
                  Password, email, and phone changes use Okta MyAccount
                  verification behind this ACME-branded surface.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="grid gap-3">
                  {oktaAccountSecurityActions.map((action) => {
                    const Icon = action.icon;
                    const actionUrl = buildAccountSecurityStepUpUrl(
                      action.actionId,
                    );

                    return (
                      <a
                        key={action.label}
                        href={actionUrl}
                        className="group grid gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] sm:grid-cols-[1fr_auto] sm:items-center"
                        aria-label={action.cta}
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] transition group-hover:border-[var(--border-strong)]">
                            <Icon
                              className="h-[18px] w-[18px]"
                              aria-hidden="true"
                              strokeWidth={2}
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[var(--foreground)]">
                              {action.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">
                              {action.description}
                            </span>
                          </span>
                        </span>
                        <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition group-hover:bg-[var(--surface)] sm:w-auto">
                          <span>{action.cta}</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)] sm:rounded-[1.9rem]">
              <CardHeader className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                  Customer session
                </p>
                <CardTitle className="font-display text-[1.8rem] leading-tight text-[var(--foreground)] sm:text-3xl">
                  Signed in as {user?.displayName || 'Customer'}
                </CardTitle>
                <CardDescription className="break-all text-sm leading-6 text-[var(--muted-foreground)] sm:text-base sm:leading-7">
                  {user?.email || 'Authenticated customer session'}
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  Email verification is handled by Okta.
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  Funding still requires step-up verification.
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  Customer identity details come from verified sign-in and
                  remain read-only here.
                </div>
                {user?.leadId || user?.customerId ? (
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                      Identity claims
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--foreground)]">
                      {user?.leadId ? (
                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <span className="text-[var(--muted-foreground)]">
                            Lead ID
                          </span>
                          <code className="max-w-full overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--foreground)] break-all sm:rounded-full">
                            {user.leadId}
                          </code>
                        </div>
                      ) : null}
                      {user?.customerId ? (
                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <span className="text-[var(--muted-foreground)]">
                            Customer ID
                          </span>
                          <code className="max-w-full overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--foreground)] break-all sm:rounded-full">
                            {user.customerId}
                          </code>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {showTokenDebug ? (
                  <div className="min-w-0 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                      Dev token inspector
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          ID token claims
                        </p>
                        {idTokenDebugRows.length > 0 ? (
                          <div className="mt-2 space-y-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3">
                            {idTokenDebugRows.map((row) => (
                              <div
                                key={`id-${row.label}`}
                                className="space-y-1 break-all"
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                                  {row.label}
                                </p>
                                <p className="text-xs leading-6 text-[var(--foreground)]">
                                  {row.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted-foreground)]">
                            No decoded ID token claims found.
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Access token claims
                        </p>
                        {accessTokenDebugRows.length > 0 ? (
                          <div className="mt-2 space-y-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3">
                            {accessTokenDebugRows.map((row) => (
                              <div
                                key={`access-${row.label}`}
                                className="space-y-1 break-all"
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                                  {row.label}
                                </p>
                                <p className="text-xs leading-6 text-[var(--foreground)]">
                                  {row.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted-foreground)]">
                            No decoded access token claims found.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="min-w-0 rounded-[1.6rem] border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)] sm:rounded-[1.9rem]">
              <CardHeader className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--accent-ink)]">
                  Next best action
                </p>
                <CardTitle className="font-display text-[1.8rem] leading-tight text-[var(--foreground)] sm:text-3xl">
                  Resume the lending journey.
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                <p className="text-sm leading-7 text-[var(--foreground)] sm:text-base sm:leading-8">
                  Review your account, then return to the guarded application
                  shell when you are ready to keep moving.
                </p>
                <Button
                  asChild
                  className="w-full rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)] sm:w-auto"
                >
                  <Link href="/apply/personal-info">Continue application</Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
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
  Input,
} from '@acme-los/ui-web';
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
  const [showTokenDebug, setShowTokenDebug] = React.useState(false);
  const [isProfileLoading, setIsProfileLoading] = React.useState(true);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const tokenDebugSupported =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'okta';

  React.useEffect(() => {
    let isMounted = true;

    const loadCustomerProfile = async () => {
      if (!session.isAuthenticated) {
        if (isMounted) {
          setFormState(emptyCustomerProfile);
          setIsProfileLoading(false);
        }

        return;
      }

      setIsProfileLoading(true);
      try {
        const response = await webApiClient.customer.getProfile();

        if (!isMounted) {
          return;
        }

        setFormState({
          ...emptyCustomerProfile,
          ...response.profile,
          email: response.profile.email || user?.email || '',
        });
        setStatusMessage(null);
      } catch (error) {
        if (!isMounted) {
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
        if (isMounted) {
          setIsProfileLoading(false);
        }
      }
    };

    void loadCustomerProfile();

    return () => {
      isMounted = false;
    };
  }, [session.isAuthenticated, user?.email, webApiClient]);

  React.useEffect(() => {
    if (!tokenDebugSupported || typeof window === 'undefined') {
      setShowTokenDebug(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    setShowTokenDebug(searchParams.get('token_debug') === '1');
  }, [tokenDebugSupported]);

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

  const updateField = React.useCallback(
    (field: keyof CustomerProfileFormState, value: string) => {
      setFormState((currentState) => ({
        ...currentState,
        [field]: value,
      }));
      setStatusMessage(null);
    },
    [],
  );

  const saveProfile = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsSavingProfile(true);

      try {
        const response = await webApiClient.customer.updateProfile({
          profile: formState,
        });
        setFormState(response.profile);
        setStatusMessage('Profile changes saved to the secure web session.');
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Unable to save profile changes right now.',
        );
      } finally {
        setIsSavingProfile(false);
      }
    },
    [formState, webApiClient],
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
                Keep your contact details current.
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                Your verified identity comes from Okta. Contact details and
                address updates live here so the application and support team
                have the latest reachability information.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 p-5 sm:p-6 lg:p-8">
              <form className="space-y-8" onSubmit={saveProfile}>
                {isProfileLoading ? (
                  <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                    Loading your secure profile details.
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-first-name"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      First name
                    </label>
                    <Input
                      id="customer-first-name"
                      value={user?.firstName || ''}
                      readOnly
                      className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-last-name"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      Last name
                    </label>
                    <Input
                      id="customer-last-name"
                      value={user?.lastName || ''}
                      readOnly
                      className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-email"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      Email address
                    </label>
                    <Input
                      id="customer-email"
                      value={formState.email}
                      onChange={(event) =>
                        updateField('email', event.target.value)
                      }
                      className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-phone"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      Phone number
                    </label>
                    <Input
                      id="customer-phone"
                      value={formState.phone}
                      onChange={(event) =>
                        updateField('phone', event.target.value)
                      }
                      className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="customer-street-address"
                    className="text-sm font-medium text-[var(--foreground)]"
                  >
                    Street address
                  </label>
                  <Input
                    id="customer-street-address"
                    value={formState.streetAddress}
                    onChange={(event) =>
                      updateField('streetAddress', event.target.value)
                    }
                    className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="customer-address-line-2"
                    className="text-sm font-medium text-[var(--foreground)]"
                  >
                    Address line 2
                  </label>
                  <Input
                    id="customer-address-line-2"
                    value={formState.addressLine2}
                    onChange={(event) =>
                      updateField('addressLine2', event.target.value)
                    }
                    className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.1fr_0.7fr_0.7fr]">
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-city"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      City
                    </label>
                    <Input
                      id="customer-city"
                      value={formState.city}
                      onChange={(event) =>
                        updateField('city', event.target.value)
                      }
                      className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-state"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      State
                    </label>
                    <Input
                      id="customer-state"
                      value={formState.state}
                      onChange={(event) =>
                        updateField('state', event.target.value)
                      }
                      className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="customer-zip-code"
                      className="text-sm font-medium text-[var(--foreground)]"
                    >
                      Zip code
                    </label>
                    <Input
                      id="customer-zip-code"
                      value={formState.zipCode}
                      onChange={(event) =>
                        updateField('zipCode', event.target.value)
                      }
                      className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                    />
                  </div>
                </div>

                <Alert className="rounded-[1.4rem] border-[var(--border)] bg-[var(--surface-strong)] p-4 sm:p-5">
                  <AlertTitle className="text-sm text-[var(--foreground)]">
                    Identity stays tied to verified sign-in
                  </AlertTitle>
                  <AlertDescription className="text-[var(--muted-foreground)]">
                    Name fields are locked to your verified customer identity.
                    Email, phone, and address updates are available here first
                    and will later sync through the BFF.
                  </AlertDescription>
                  {statusMessage ? (
                    <p className="mt-3 text-sm font-medium text-[var(--brand)]">
                      {statusMessage}
                    </p>
                  ) : null}
                </Alert>

                <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={isSavingProfile || isProfileLoading}
                      className="w-full rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)] sm:w-auto"
                    >
                      {isSavingProfile
                        ? 'Saving profile changes'
                        : 'Save profile changes'}
                    </Button>
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
              </form>
            </CardContent>
          </Card>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
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
                  Email MFA is enabled for sign-in.
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  Funding still requires step-up verification.
                </div>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  Customer identity details come from Okta and remain read-only
                  here.
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
                  Use this dashboard for profile maintenance, then return to the
                  guarded application shell when you are ready to keep moving.
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

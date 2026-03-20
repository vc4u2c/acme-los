'use client';

import * as React from 'react';
import Link from 'next/link';
import { RequireAuth, useAuthSession } from '@acme-los/auth/web';
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
import { SiteHeader } from '../../../components/web/site-header';
import {
  defaultCustomerProfileDraft,
  persistCustomerProfileDraft,
  readCustomerProfileDraft,
  type CustomerProfileDraft,
} from '../../../lib/customer-profile';

const navigationItems: { href: string; label: string }[] = [];

function ProfileDashboardContent(): React.ReactElement {
  const { session } = useAuthSession();
  const user = session.user;
  const [formState, setFormState] = React.useState<CustomerProfileDraft>(
    defaultCustomerProfileDraft,
  );
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedDraft = readCustomerProfileDraft();
    setFormState({
      ...storedDraft,
      email: storedDraft.email || user?.email || '',
    });
  }, [user?.email]);

  const updateField = React.useCallback(
    (field: keyof CustomerProfileDraft, value: string) => {
      setFormState((currentState) => ({
        ...currentState,
        [field]: value,
      }));
      setStatusMessage(null);
    },
    [],
  );

  const saveProfile = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      persistCustomerProfileDraft(formState);
      setStatusMessage('Profile changes saved locally in this browser.');
    },
    [formState],
  );

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} variant="application" />

      <section className="site-shell py-8 lg:py-10">
        <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[2rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Customer dashboard
              </p>
              <CardTitle className="font-display text-4xl text-[var(--foreground)]">
                Keep your contact details current.
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-8 text-[var(--muted-foreground)]">
                Your verified identity comes from Okta. Contact details and
                address updates live here so the application and support team
                have the latest reachability information.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 lg:p-8">
              <form className="space-y-8" onSubmit={saveProfile}>
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
                      value={user?.firstName || user?.displayName || ''}
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
                      className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
                    >
                      Save profile changes
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
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

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
              <CardHeader>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                  Customer session
                </p>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  Signed in as {user?.displayName || 'Customer'}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                  {user?.email || 'Authenticated customer session'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>

            <Card className="rounded-[1.9rem] border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
              <CardHeader>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--accent-ink)]">
                  Next best action
                </p>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  Resume the lending journey.
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-base leading-8 text-[var(--foreground)]">
                  Use this dashboard for profile maintenance, then return to the
                  guarded application shell when you are ready to keep moving.
                </p>
                <Button
                  asChild
                  className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
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

export default function CustomerProfilePage(): React.ReactElement {
  return (
    <RequireAuth
      requirement={{
        requiresAuthentication: true,
        minimumAssuranceLevel: 'aal1',
      }}
    >
      <ProfileDashboardContent />
    </RequireAuth>
  );
}

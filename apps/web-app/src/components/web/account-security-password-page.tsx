'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FormLabel,
  Input,
} from '@acme-los/ui-web';
import { buildPasswordRecoveryUrl } from '../../lib/okta-account-actions';
import { SiteHeader } from './site-header';

const navigationItems: { href: string; label: string }[] = [];

const fieldClassName =
  'h-11 rounded-md border-[var(--border)] bg-[color:var(--surface-strong)/0.92] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-sm focus-visible:ring-[var(--ring)]';

export function AccountSecurityPasswordPage(): React.ReactElement {
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState(false);

  const clearPasswordFields = React.useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation must match.');
      setNewPassword('');
      setConfirmPassword('');
      return;
    }

    setIsSubmitting(true);

    try {
      await webApiClient.accountSecurity.changePassword({
        currentPassword,
        newPassword,
      });
      clearPasswordFields();
      setIsComplete(true);
    } catch (error) {
      clearPasswordFields();
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to change the password.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} variant="application" />
      {isComplete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--background)/0.72] px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-change-complete-title"
        >
          <div className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:p-6">
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--accent-ink)]">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2
              id="password-change-complete-title"
              className="font-display text-3xl leading-tight"
            >
              Password changed
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Sign in with your new password to start a fresh secure session.
            </p>
            <Button asChild className="mt-6 w-full rounded-md">
              <a href="/api/auth/logout">
                <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                Securely sign in again
              </a>
            </Button>
          </div>
        </div>
      ) : null}
      <section className="site-shell py-6 sm:py-8 lg:py-10">
        <div className="mx-auto max-w-3xl">
          <header className="border-b border-[var(--border)] pb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                  Account security
                </p>
                <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
                  Change password
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
                  Enter your current password and choose a new one. You will
                  sign in again after the change.
                </p>
              </div>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--brand)]">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </header>

          <div className="grid gap-8 pt-7 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0">
              {!isComplete ? (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <FormLabel htmlFor="current-password">
                      Current password
                    </FormLabel>
                    <Input
                      id="current-password"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) =>
                        setCurrentPassword(event.currentTarget.value)
                      }
                      className={fieldClassName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="new-password">New password</FormLabel>
                    <Input
                      id="new-password"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) =>
                        setNewPassword(event.currentTarget.value)
                      }
                      className={fieldClassName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="confirm-password">
                      Confirm new password
                    </FormLabel>
                    <Input
                      id="confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.currentTarget.value)
                      }
                      className={fieldClassName}
                      required
                    />
                  </div>
                  {errorMessage ? (
                    <Alert className="rounded-md border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4">
                      <AlertTitle>Request failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-md bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
                    >
                      {isSubmitting ? 'Changing' : 'Change password'}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-md border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                    >
                      <Link href="/account/profile">
                        <ArrowLeft
                          className="mr-2 h-4 w-4"
                          aria-hidden="true"
                        />
                        Back
                      </Link>
                    </Button>
                  </div>
                  <a
                    className="inline-flex text-sm font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
                    href={buildPasswordRecoveryUrl(
                      '/account/profile?account_action=password',
                    )}
                  >
                    Forgot password?
                  </a>
                </form>
              ) : null}
            </div>

            <aside className="border-t border-[var(--border)] pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden="true"
                />
                Verification complete
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                Your current password and a text-message code were verified
                before this page opened.
              </p>
              <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                Forgot your password? Account recovery uses your enrolled
                recovery methods and security question.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, KeyRound, LogIn } from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
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
  FormLabel,
  Input,
} from '@acme-los/ui-web';
import { buildHostedPasswordRecoveryUrl } from '../../lib/okta-account-actions';
import { SiteHeader } from './site-header';

const navigationItems: { href: string; label: string }[] = [];

const fieldClassName =
  'h-11 rounded-[0.85rem] border-[var(--border)] bg-[color:var(--surface-strong)/0.92] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-sm focus-visible:ring-[var(--ring)]';

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
      <section className="site-shell py-6 sm:py-8 lg:py-10">
        <div className="mx-auto max-w-3xl">
          <Card className="rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:rounded-[2rem]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Account security
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <CardTitle className="font-display text-[2rem] leading-tight text-[var(--foreground)] sm:text-[2.35rem] lg:text-4xl">
                    Change password.
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                    Confirm your password and phone/SMS verification before this
                    page. Okta requires the current password on the final
                    update, then you sign in again with the new password.
                  </CardDescription>
                </div>
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)]">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 lg:p-8">
              {isComplete ? (
                <div className="space-y-5">
                  <Alert className="rounded-[1.4rem] border-[var(--accent)] bg-[var(--surface-spot)] p-4 sm:p-5">
                    <CheckCircle2
                      className="h-5 w-5 text-[var(--accent-ink)]"
                      aria-hidden="true"
                    />
                    <AlertTitle>Password changed</AlertTitle>
                    <AlertDescription>
                      Sign in again so ACME can refresh the verified customer
                      session.
                    </AlertDescription>
                  </Alert>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
                    >
                      <a href="/api/auth/logout">
                        <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                        Sign in again
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                    >
                      <Link href="/account/profile">
                        <ArrowLeft
                          className="mr-2 h-4 w-4"
                          aria-hidden="true"
                        />
                        Back to dashboard
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
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
                    <Alert className="rounded-[1.25rem] border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4">
                      <AlertTitle>Request failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
                    >
                      {isSubmitting ? 'Changing' : 'Change password'}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
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
                    href={buildHostedPasswordRecoveryUrl(
                      '/account/profile?account_action=password',
                    )}
                  >
                    Forgot password?
                  </a>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

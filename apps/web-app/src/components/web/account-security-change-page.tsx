'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  LogIn,
  Mail,
  Phone,
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
import { SiteHeader } from './site-header';

type AccountSecurityChangeAction = 'email' | 'phone';

type AccountSecurityChangePageProps = {
  action: AccountSecurityChangeAction;
  currentValue?: string;
};

type EmailTransaction = {
  emailId: string;
  challengeId: string;
  displayValue: string;
};

type PhoneTransaction = {
  phoneId: string;
  displayValue: string;
};

type PendingTransaction = EmailTransaction | PhoneTransaction;

const navigationItems: { href: string; label: string }[] = [];

const fieldClassName =
  'h-11 rounded-md border-[var(--border)] bg-[color:var(--surface-strong)/0.92] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-sm focus-visible:ring-[var(--ring)]';

function requireResponseValue(
  value: string | undefined,
  label: string,
): string {
  const normalizedValue = value?.trim() ?? '';

  if (normalizedValue.length === 0) {
    throw new Error(`Okta did not return a valid ${label}. Try again.`);
  }

  return normalizedValue;
}

function isEmailTransaction(
  action: AccountSecurityChangeAction,
  transaction: PendingTransaction,
): transaction is EmailTransaction {
  return action === 'email' && 'emailId' in transaction;
}

function actionCopy(action: AccountSecurityChangeAction) {
  return action === 'email'
    ? {
        eyebrow: 'Account security',
        title: 'Change sign-in email.',
        description:
          'Confirm your password and phone/SMS OTP first. Then enter the new email and verify the email code Okta sends.',
        valueLabel: 'New sign-in email',
        valuePlaceholder: 'name@example.com',
        codeLabel: 'Email verification code',
        codeHint: 'Enter the code sent to the new email.',
        startLabel: 'Send email code',
        verifyLabel: 'Verify email change',
        successTitle: 'Email changed',
        successDescription:
          'Sign in again with the new email to start a fresh secure session.',
        icon: Mail,
      }
    : {
        eyebrow: 'Account security',
        title: 'Change SMS phone.',
        description:
          'Confirm your password and email OTP first. Then enter the new SMS phone and verify the SMS code Okta sends.',
        valueLabel: 'New SMS phone',
        valuePlaceholder: '+13145550123',
        codeLabel: 'SMS verification code',
        codeHint: 'Enter the code sent to the new phone.',
        startLabel: 'Send SMS code',
        verifyLabel: 'Verify phone change',
        successTitle: 'Phone changed',
        successDescription:
          'Sign in again so ACME can refresh your verified session before funding.',
        icon: Phone,
      };
}

export function AccountSecurityChangePage({
  action,
  currentValue,
}: AccountSecurityChangePageProps): React.ReactElement {
  const copy = actionCopy(action);
  const Icon = copy.icon;
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [value, setValue] = React.useState('');
  const [verificationCode, setVerificationCode] = React.useState('');
  const [pendingTransaction, setPendingTransaction] =
    React.useState<PendingTransaction | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState(false);

  const handleStart = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (action === 'email') {
        const response = await webApiClient.accountSecurity.startEmailChange({
          email: value,
        });
        setPendingTransaction({
          emailId: requireResponseValue(response.emailId, 'email transaction'),
          challengeId: requireResponseValue(
            response.challengeId,
            'email verification challenge',
          ),
          displayValue: requireResponseValue(response.email, 'email address'),
        });
      } else {
        const response = await webApiClient.accountSecurity.startPhoneChange({
          phoneNumber: value,
        });
        setPendingTransaction({
          phoneId: requireResponseValue(response.phoneId, 'phone transaction'),
          displayValue: requireResponseValue(
            response.phoneNumber,
            'phone number',
          ),
        });
      }
      setVerificationCode('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to start this account change.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pendingTransaction) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEmailTransaction(action, pendingTransaction)) {
        await webApiClient.accountSecurity.verifyEmailChange({
          emailId: pendingTransaction.emailId,
          challengeId: pendingTransaction.challengeId,
          verificationCode,
        });
      } else {
        await webApiClient.accountSecurity.verifyPhoneChange({
          phoneId: pendingTransaction.phoneId,
          verificationCode,
        });
      }
      setIsComplete(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to verify this account change.',
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
          aria-labelledby="account-security-complete-title"
        >
          <div className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:p-6">
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--accent-ink)]">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2
              id="account-security-complete-title"
              className="font-display text-3xl leading-tight text-[var(--foreground)]"
            >
              {copy.successTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              {copy.successDescription}
            </p>
            <Button
              asChild
              className="mt-6 w-full rounded-md bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
            >
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
                  {copy.eyebrow}
                </p>
                <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
                  {copy.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
                  {copy.description}
                </p>
              </div>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--brand)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </header>

          <div className="grid gap-8 pt-7 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0">
              {pendingTransaction ? (
                <form className="space-y-5" onSubmit={handleVerify}>
                  <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                      Pending verification
                    </p>
                    <p className="mt-2 break-words text-sm text-[var(--foreground)]">
                      {pendingTransaction.displayValue}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="verification-code">
                      {copy.codeLabel}
                    </FormLabel>
                    <Input
                      id="verification-code"
                      name="verificationCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(event.currentTarget.value)
                      }
                      placeholder="123456"
                      className={fieldClassName}
                      required
                    />
                    <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                      {copy.codeHint}
                    </p>
                  </div>
                  {errorMessage ? (
                    <Alert className="rounded-md border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4">
                      <AlertTitle>Verification failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-md bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)] sm:w-auto"
                  >
                    {isSubmitting ? 'Verifying' : copy.verifyLabel}
                  </Button>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={handleStart}>
                  <div className="space-y-2">
                    <FormLabel htmlFor="account-security-value">
                      {copy.valueLabel}
                    </FormLabel>
                    <Input
                      id="account-security-value"
                      name="accountSecurityValue"
                      type={action === 'email' ? 'email' : 'tel'}
                      autoComplete={action === 'email' ? 'email' : 'tel'}
                      value={value}
                      onChange={(event) => setValue(event.currentTarget.value)}
                      placeholder={copy.valuePlaceholder}
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
                      {isSubmitting ? 'Sending' : copy.startLabel}
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
                </form>
              )}
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
                {action === 'email'
                  ? 'Password and text-message verification were completed for this email change.'
                  : 'Password and email verification were completed for this phone change.'}
              </p>
              {currentValue ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    Current value
                  </p>
                  <p className="mt-2 break-words text-sm">{currentValue}</p>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

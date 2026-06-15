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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  'h-11 rounded-[0.85rem] border-[var(--border)] bg-[color:var(--surface-strong)/0.92] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-sm focus-visible:ring-[var(--ring)]';

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
          'Phone/SMS verification protects this change. Okta sends the final OTP to the new email.',
        valueLabel: 'New sign-in email',
        valuePlaceholder: 'name@example.com',
        codeLabel: 'Email verification code',
        codeHint: 'Enter the code sent to the new email.',
        startLabel: 'Send email code',
        verifyLabel: 'Verify email change',
        successTitle: 'Email changed',
        successDescription:
          'Sign in again with the new email so ACME can refresh the verified session.',
        icon: Mail,
      }
    : {
        eyebrow: 'Account security',
        title: 'Change SMS phone.',
        description:
          'Email verification protects this change. Okta sends the final OTP to the new phone.',
        valueLabel: 'New SMS phone',
        valuePlaceholder: '+13145550123',
        codeLabel: 'SMS verification code',
        codeHint: 'Enter the code sent to the new phone.',
        startLabel: 'Send SMS code',
        verifyLabel: 'Verify phone change',
        successTitle: 'Phone changed',
        successDescription:
          'Sign in again and use the new phone/SMS OTP before funding.',
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
          emailId: response.emailId,
          challengeId: response.challengeId,
          displayValue: response.email,
        });
      } else {
        const response = await webApiClient.accountSecurity.startPhoneChange({
          phoneNumber: value,
        });
        setPendingTransaction({
          phoneId: response.phoneId,
          displayValue: response.phoneNumber,
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
      <section className="site-shell py-6 sm:py-8 lg:py-10">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.95fr_0.65fr] lg:gap-7">
          <Card className="min-w-0 rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)] sm:rounded-[2rem]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                {copy.eyebrow}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-3">
                  <CardTitle className="font-display text-[2rem] leading-tight text-[var(--foreground)] sm:text-[2.35rem] lg:text-4xl">
                    {copy.title}
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                    {copy.description}
                  </CardDescription>
                </div>
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
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
                    <AlertTitle>{copy.successTitle}</AlertTitle>
                    <AlertDescription>
                      {copy.successDescription}
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
              ) : pendingTransaction ? (
                <form className="space-y-5" onSubmit={handleVerify}>
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
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
                    <Alert className="rounded-[1.25rem] border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4">
                      <AlertTitle>Verification failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)] sm:w-auto"
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
                      {isSubmitting ? 'Sending' : copy.startLabel}
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
                </form>
              )}
            </CardContent>
          </Card>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="rounded-[1.6rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)] sm:rounded-[1.9rem]">
              <CardHeader className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                  Verified session
                </p>
                <CardTitle className="font-display text-[1.8rem] leading-tight text-[var(--foreground)] sm:text-3xl">
                  Opposite-channel proof.
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-[var(--muted-foreground)] sm:text-base sm:leading-7">
                  {action === 'email'
                    ? 'This page opens only after phone/SMS step-up.'
                    : 'This page opens only after email step-up.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
                  <ShieldCheck
                    className="mr-2 inline h-4 w-4 text-[var(--brand)]"
                    aria-hidden="true"
                  />
                  Okta owns the OTP challenge.
                </div>
                {currentValue ? (
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                      Current value
                    </p>
                    <p className="mt-2 break-words text-sm text-[var(--foreground)]">
                      {currentValue}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

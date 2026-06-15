import type * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { buildHostedPasswordRecoveryUrl } from '../../lib/okta-account-actions';
import { SiteHeader } from './site-header';

const navigationItems: { href: string; label: string }[] = [];

export function AccountSecurityPasswordPage(): React.ReactElement {
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
                    Change or reset password.
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                    Password recovery stays inside the Okta-hosted widget. ACME
                    does not collect password values.
                  </CardDescription>
                </div>
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)]">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:p-6 lg:p-8">
              <Button
                asChild
                className="rounded-full bg-[var(--brand)] px-6 text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
              >
                <a href={buildHostedPasswordRecoveryUrl()}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  Continue
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
              >
                <Link href="/account/profile">
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

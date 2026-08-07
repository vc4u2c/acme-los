'use client';

import * as React from 'react';
import type { AuthRequirement } from '@acme-los/auth/contracts';
import { useAuthSession } from '@acme-los/auth/web';
import { Button } from '@acme-los/ui-web';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useTrackSignInStarted } from './analytics/auth-analytics-tracker';
import { CustomerAuthFooter } from './customer-auth-footer';
import { CustomerAuthHeader } from './customer-auth-header';

type CustomerMockSignInPageProps = {
  returnTo: string;
  minimumAssuranceLevel: Exclude<
    AuthRequirement['minimumAssuranceLevel'],
    undefined
  >;
  errorMessage?: string;
};

export function CustomerMockSignInPage({
  returnTo,
  minimumAssuranceLevel,
  errorMessage,
}: CustomerMockSignInPageProps): React.ReactElement {
  const { signIn } = useAuthSession();
  const trackSignInStarted = useTrackSignInStarted();
  const [isLaunching, setIsLaunching] = React.useState(false);

  const launch = React.useCallback(() => {
    setIsLaunching(true);
    trackSignInStarted({ returnTo, minimumAssuranceLevel });
    void signIn({ returnTo, minimumAssuranceLevel });
  }, [minimumAssuranceLevel, returnTo, signIn, trackSignInStarted]);

  return (
    <>
      <CustomerAuthHeader />
      <main className="min-h-[calc(100vh-10rem)] border-b border-[var(--border)] text-[var(--foreground)]">
        <section className="site-shell grid gap-8 py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(20rem,1.2fr)] lg:gap-16 lg:py-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
              Customer sign in
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Opening secure sign in
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[var(--muted-foreground)]">
              Continue to your application, disclosures, and funding updates.
            </p>
          </div>

          <div className="border-t border-[var(--border-strong)] pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <div className="mx-auto max-w-xl">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                <h2 className="text-xl font-semibold">Sign in</h2>
                <ShieldCheck
                  className="h-6 w-6 text-[var(--brand)]"
                  aria-hidden="true"
                />
              </div>
              {errorMessage ? (
                <div
                  className="mt-5 rounded-md border border-[color:var(--critical)/0.45] bg-[color:var(--critical)/0.08] px-4 py-3 text-sm text-[var(--critical)]"
                  role="alert"
                >
                  {errorMessage}
                </div>
              ) : null}
              <Button
                className="mt-6 w-full rounded-md sm:w-auto"
                onClick={launch}
                disabled={isLaunching}
              >
                {isLaunching ? 'Signing in...' : 'Continue to secure sign in'}
                {!isLaunching ? (
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <CustomerAuthFooter />
    </>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuthSession } from '@acme-los/auth/web';
import { AcmeMarkIcon } from '../../../components/web/icons';
import { CustomerAuthHeader } from '../../../components/web/customer-auth-header';

export default function AuthCallbackPage(): React.ReactElement {
  const { handleCallback, session } = useAuthSession();
  const hasHandledRef = React.useRef(false);

  React.useEffect(() => {
    if (hasHandledRef.current) {
      return;
    }

    hasHandledRef.current = true;
    void handleCallback();
  }, [handleCallback]);

  return (
    <>
      <CustomerAuthHeader />
      <main className="site-shell flex min-h-[68vh] items-center justify-center py-16 text-[var(--foreground)]">
        <div className="w-full max-w-3xl rounded-[2rem] border border-[var(--border)] bg-[color:var(--surface)/0.96] p-6 shadow-2xl shadow-[color:var(--shadow-soft)] sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)]">
                  <AcmeMarkIcon className="h-8 w-8" />
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                    ACME LOS
                  </p>
                  <p className="font-display text-3xl text-[var(--foreground)]">
                    Installment flow
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                  Secure redirect
                </p>
                <h1 className="font-display text-4xl text-[var(--foreground)]">
                  Finishing sign-in
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--muted-foreground)]">
                  We are completing the Okta redirect, restoring your guarded
                  application path, and bringing your customer session back into
                  the shell now.
                </p>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--overlay-surface)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
              Secure customer authentication powered by Okta hosted sign-in.
            </div>
          </div>

          {session.errorMessage ? (
            <div className="mt-6 rounded-[1.5rem] border border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4">
              <p className="text-sm font-medium text-[var(--critical)]">
                {session.errorMessage}
              </p>
              <Link
                href="/account/sign-in"
                className="mt-3 inline-flex text-sm font-semibold text-[var(--brand)] underline decoration-[color:var(--brand)/0.35] underline-offset-4"
              >
                Return to customer sign-in
              </Link>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.5rem] border border-[var(--border)] bg-[var(--overlay-surface)] p-4 text-sm text-[var(--muted-foreground)]">
              If this takes more than a moment, the hosted sign-in flow may
              still be finishing a verification or redirect step.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

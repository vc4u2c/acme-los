'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { AuthRequirement } from '@acme-los/auth/contracts';
import { isAssuranceSatisfied } from '@acme-los/auth/core';
import { useAuthSession } from './provider';

function getReturnTo(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function RequireAuth({
  requirement,
  children,
}: {
  requirement: AuthRequirement;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <React.Suspense
      fallback={<RequireAuthFallback requirement={requirement} />}
    >
      <RequireAuthContent requirement={requirement}>
        {children}
      </RequireAuthContent>
    </React.Suspense>
  );
}

function RequireAuthContent({
  requirement,
  children,
}: {
  requirement: AuthRequirement;
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session, signIn } = useAuthSession();
  const hasTriggeredRedirectRef = React.useRef(false);
  const minimumAssuranceLevel = requirement.minimumAssuranceLevel ?? 'aal1';
  const isSatisfied =
    session.status === 'authenticated' &&
    isAssuranceSatisfied(session.assuranceLevel, minimumAssuranceLevel);

  React.useEffect(() => {
    if (
      !requirement.requiresAuthentication ||
      hasTriggeredRedirectRef.current ||
      session.status === 'loading' ||
      isSatisfied
    ) {
      return;
    }

    hasTriggeredRedirectRef.current = true;
    void signIn({
      returnTo: getReturnTo(pathname, searchParams),
      minimumAssuranceLevel,
    }).catch(() => {
      hasTriggeredRedirectRef.current = false;
    });
  }, [
    isSatisfied,
    minimumAssuranceLevel,
    pathname,
    requirement.requiresAuthentication,
    searchParams,
    session.status,
    signIn,
  ]);

  if (!requirement.requiresAuthentication) {
    return <>{children}</>;
  }

  if (isSatisfied) {
    return <>{children}</>;
  }

  return <RequireAuthFallback requirement={requirement} />;
}

function RequireAuthFallback({
  requirement,
}: {
  requirement: AuthRequirement;
}): React.ReactElement {
  const minimumAssuranceLevel = requirement.minimumAssuranceLevel ?? 'aal1';

  return (
    <>
      <header className="border-b border-[var(--border)] bg-[color:var(--surface)/0.92] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-4 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] font-semibold sm:h-10 sm:w-10">
              A
            </span>
            <span className="min-w-0">
              <span className="text-base leading-none text-[var(--foreground)] sm:hidden">
                ACME LOS
              </span>
              <span className="hidden min-w-0 flex-col sm:flex">
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted-foreground)] sm:text-sm">
                  ACME LOS
                </span>
                <span className="text-xl leading-none text-[var(--foreground)]">
                  Installment flow
                </span>
              </span>
            </span>
          </a>
          <span className="hidden rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)] sm:inline-flex">
            Customer access
          </span>
        </div>
      </header>
      <main className="site-shell flex min-h-[65vh] items-center justify-center py-16 text-[var(--foreground)]">
        <div className="w-full max-w-xl rounded-[2rem] border border-[var(--border)] bg-[color:var(--surface)/0.96] p-8 shadow-2xl shadow-[color:var(--shadow-soft)]">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
            Secure application access
          </p>
          <h1 className="mt-4 font-display text-4xl text-[var(--foreground)]">
            Redirecting to customer sign-in
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--muted-foreground)]">
            {minimumAssuranceLevel === 'aal2'
              ? 'The funding step needs a stronger verification check before preferences and final authorization can be reviewed.'
              : 'The application flow is reserved for signed-in customers. You are being redirected to the secure Okta sign-in experience now.'}
          </p>
        </div>
      </main>
    </>
  );
}

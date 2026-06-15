'use client';

import * as React from 'react';
import type { AuthRequirement } from '@acme-los/auth/contracts';
import { useAuthSession } from '@acme-los/auth/web';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { useTrackSignInStarted } from './analytics/auth-analytics-tracker';
import { CustomerAuthFooter } from './customer-auth-footer';
import { CustomerAuthHeader } from './customer-auth-header';

const shouldAutoLaunch = process.env.NEXT_PUBLIC_AUTH_PROVIDER !== 'mock';

type CustomerAuthLaunchPageProps = {
  returnTo: string;
  minimumAssuranceLevel?: Exclude<
    AuthRequirement['minimumAssuranceLevel'],
    undefined
  >;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  launchingLabel: string;
  errorMessage?: string;
  autoLaunchOnError?: boolean;
};

export function CustomerAuthLaunchPage({
  returnTo,
  minimumAssuranceLevel = 'aal1',
  eyebrow,
  title,
  description,
  actionLabel,
  launchingLabel,
  errorMessage,
  autoLaunchOnError = false,
}: CustomerAuthLaunchPageProps): React.ReactElement {
  const { signIn } = useAuthSession();
  const trackSignInStarted = useTrackSignInStarted();
  const [isLaunching, setIsLaunching] = React.useState(false);
  const hasAutoLaunchedRef = React.useRef(false);
  const allowAutoLaunch =
    shouldAutoLaunch && (!errorMessage || autoLaunchOnError);

  const launch = React.useCallback(() => {
    setIsLaunching(true);
    trackSignInStarted({ returnTo, minimumAssuranceLevel });
    void signIn({ returnTo, minimumAssuranceLevel });
  }, [minimumAssuranceLevel, returnTo, signIn, trackSignInStarted]);

  React.useEffect(() => {
    if (!allowAutoLaunch || hasAutoLaunchedRef.current) {
      return;
    }

    if (errorMessage && autoLaunchOnError) {
      const recoveryKey = [
        'acme-los.auth-recovery',
        returnTo,
        minimumAssuranceLevel,
        errorMessage,
      ].join(':');

      if (window.sessionStorage.getItem(recoveryKey) === 'launched') {
        return;
      }

      window.sessionStorage.setItem(recoveryKey, 'launched');
    }

    hasAutoLaunchedRef.current = true;
    launch();
  }, [
    allowAutoLaunch,
    autoLaunchOnError,
    errorMessage,
    launch,
    minimumAssuranceLevel,
    returnTo,
  ]);

  return (
    <>
      <CustomerAuthHeader />
      <main className="min-h-[calc(100vh-8rem)] text-[var(--foreground)]">
        <section className="site-shell py-10 lg:py-14">
          <div className="mx-auto max-w-3xl">
            <Card className="rounded-[2rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
              <CardHeader>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                  {eyebrow}
                </p>
                <CardTitle className="font-display text-4xl text-[var(--foreground)]">
                  {title}
                </CardTitle>
                <p className="text-base leading-8 text-[var(--muted-foreground)]">
                  {description}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {errorMessage ? (
                  <div className="rounded-[1.5rem] border border-[color:var(--critical)/0.28] bg-[color:var(--critical)/0.08] p-4 text-sm font-medium text-[var(--critical)]">
                    {errorMessage}
                  </div>
                ) : null}
                <Button
                  className="w-full rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]"
                  onClick={launch}
                >
                  {isLaunching ? launchingLabel : actionLabel}
                </Button>
                <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                  This route stays available for bookmarked or support-assisted
                  entry, while the primary product flow now goes straight
                  through the Okta hosted experience.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <CustomerAuthFooter />
    </>
  );
}

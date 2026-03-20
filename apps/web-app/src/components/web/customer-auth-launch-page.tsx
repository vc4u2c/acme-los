'use client';

import * as React from 'react';
import { useAuthSession } from '@acme-los/auth/web';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { CustomerAuthFooter } from './customer-auth-footer';
import { CustomerAuthHeader } from './customer-auth-header';

const shouldAutoLaunch = process.env.NEXT_PUBLIC_AUTH_PROVIDER !== 'mock';

type CustomerAuthLaunchPageProps = {
  returnTo: string;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  launchingLabel: string;
};

export function CustomerAuthLaunchPage({
  returnTo,
  eyebrow,
  title,
  description,
  actionLabel,
  launchingLabel,
}: CustomerAuthLaunchPageProps): React.ReactElement {
  const { signIn } = useAuthSession();
  const [isLaunching, setIsLaunching] = React.useState(false);
  const hasAutoLaunchedRef = React.useRef(false);

  const launch = React.useCallback(() => {
    setIsLaunching(true);
    void signIn({ returnTo });
  }, [returnTo, signIn]);

  React.useEffect(() => {
    if (!shouldAutoLaunch || hasAutoLaunchedRef.current) {
      return;
    }

    hasAutoLaunchedRef.current = true;
    launch();
  }, [launch]);

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

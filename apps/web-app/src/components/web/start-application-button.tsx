'use client';

import * as React from 'react';
import { Button } from '@acme-los/ui-web';
import { useAuthSession } from '@acme-los/auth/web';

const firstApplicationStepPath = '/apply/personal-info';

export function StartApplicationButton(): React.ReactElement {
  const { session, signIn } = useAuthSession();
  const [isLaunching, setIsLaunching] = React.useState(false);

  const handleClick = React.useCallback(() => {
    if (session.isAuthenticated) {
      window.location.assign(firstApplicationStepPath);
      return;
    }

    setIsLaunching(true);
    void signIn({
      returnTo: firstApplicationStepPath,
      minimumAssuranceLevel: 'aal1',
    }).finally(() => {
      setIsLaunching(false);
    });
  }, [session.isAuthenticated, signIn]);

  return (
    <Button
      type="button"
      size="lg"
      className="rounded-full bg-[var(--brand)] px-7 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
      onClick={handleClick}
    >
      {isLaunching ? 'Opening secure sign in...' : 'Start application'}
    </Button>
  );
}

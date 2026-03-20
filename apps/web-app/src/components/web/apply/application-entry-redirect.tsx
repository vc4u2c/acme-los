'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthRequirementSatisfied } from '@acme-los/auth/web';

type ApplicationEntryRedirectProps = {
  firstApplicationStepPath: string;
  children: React.ReactNode;
};

export function ApplicationEntryRedirect({
  firstApplicationStepPath,
  children,
}: ApplicationEntryRedirectProps): React.ReactElement {
  const router = useRouter();
  const isAuthenticated = useAuthRequirementSatisfied('aal1');

  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    router.replace(firstApplicationStepPath);
  }, [firstApplicationStepPath, isAuthenticated, router]);

  return <>{children}</>;
}

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveOrCreateLeadId } from '@acme-los/auth/web';

export function LeadIdTracker(): null {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  React.useEffect(() => {
    resolveOrCreateLeadId(new URLSearchParams(search));
  }, [search]);

  return null;
}

'use client';

import * as React from 'react';
import { formatAppEnvironmentLabel } from '@acme-los/core/config';

type HealthSnapshot = {
  environment?: string;
};

export function RuntimeEnvironmentBadge({
  initialLabel,
}: {
  initialLabel: string;
}): React.ReactElement {
  const [label, setLabel] = React.useState(initialLabel);

  React.useEffect(() => {
    let isActive = true;

    void fetch('/api/health', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as HealthSnapshot;
      })
      .then((snapshot) => {
        if (!isActive || !snapshot?.environment) {
          return;
        }

        setLabel(formatAppEnvironmentLabel(snapshot.environment));
      })
      .catch(() => {
        // Keep the initial label when the health endpoint is unavailable.
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="inline-flex w-fit items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
      {label}
    </div>
  );
}

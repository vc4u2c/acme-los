import * as React from 'react';
import { cn } from '../utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  indicatorClassName?: string;
}

export function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  ...props
}: ProgressProps): React.ReactElement {
  const safeMax = max <= 0 ? 100 : max;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percentage = (clamped / safeMax) * 100;

  return (
    <div
      role="progressbar"
      aria-valuemax={safeMax}
      aria-valuemin={0}
      aria-valuenow={clamped}
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-[var(--surface-accent)]',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-[var(--brand)] transition-all',
          indicatorClassName,
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

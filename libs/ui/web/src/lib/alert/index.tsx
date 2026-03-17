import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 text-sm shadow-sm',
  {
    variants: {
      variant: {
        default:
          'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]',
        muted:
          'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)]',
        accent:
          'border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({
  className,
  variant,
  ...props
}: AlertProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        'mt-2 text-sm leading-6 text-[var(--muted-foreground)]',
        className,
      )}
      {...props}
    />
  );
}

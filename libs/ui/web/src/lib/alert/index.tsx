import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 text-sm shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-slate-200 bg-white text-slate-950',
        muted: 'border-slate-200 bg-slate-50 text-slate-950',
        accent: 'border-amber-300 bg-amber-50 text-slate-950',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({
  className,
  variant,
  ...props
}: AlertProps): React.ReactElement {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('font-semibold leading-none tracking-tight', className)} {...props} />;
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('mt-2 text-sm leading-6 text-slate-600', className)} {...props} />;
}

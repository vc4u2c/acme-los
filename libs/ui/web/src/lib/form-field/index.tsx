import * as React from 'react';
import { cn } from '../utils';

export function FormField({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('space-y-2.5', className)} {...props} />;
}

export function FormLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.ReactElement {
  return (
    <label
      className={cn(
        'text-sm font-semibold uppercase tracking-[0.22em] text-slate-600',
        className,
      )}
      {...props}
    />
  );
}

export function FormHint({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn('text-sm leading-6 text-slate-600', className)} {...props} />;
}

export function FormError({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn('text-sm font-medium text-red-700', className)} {...props} />;
}

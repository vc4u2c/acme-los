import * as React from 'react';
import { cn } from '../utils';

export type RadioGroupProps = React.HTMLAttributes<HTMLDivElement>;

export function RadioGroup({
  className,
  ...props
}: RadioGroupProps): React.ReactElement {
  return <div role="radiogroup" className={cn('grid gap-3', className)} {...props} />;
}

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  description?: React.ReactNode;
  itemClassName?: string;
  children: React.ReactNode;
}

export const RadioGroupItem = React.forwardRef<
  HTMLInputElement,
  RadioGroupItemProps
>(({ className, itemClassName, children, description, ...props }, ref) => {
  return (
    <label className={cn('block', className)}>
      <input ref={ref} type="radio" className="peer sr-only" {...props} />
      <span
        className={cn(
          'flex min-h-[112px] flex-col justify-between rounded-[1.5rem] border border-slate-300 bg-white p-4 text-left shadow-sm transition peer-checked:border-slate-900 peer-checked:bg-slate-50 peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400',
          itemClassName,
        )}
      >
        <span className="text-base font-semibold text-slate-950">{children}</span>
        {description ? (
          <span className="mt-2 text-sm leading-6 text-slate-600">{description}</span>
        ) : null}
      </span>
    </label>
  );
});

RadioGroupItem.displayName = 'RadioGroupItem';

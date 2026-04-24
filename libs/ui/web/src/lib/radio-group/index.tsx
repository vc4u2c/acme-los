import * as React from 'react';
import { cn } from '../utils';

export type RadioGroupProps = React.HTMLAttributes<HTMLDivElement>;

export function RadioGroup({
  className,
  ...props
}: RadioGroupProps): React.ReactElement {
  return (
    <div role="radiogroup" className={cn('grid gap-3', className)} {...props} />
  );
}

export interface RadioGroupItemProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  description?: React.ReactNode;
  itemClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  children: React.ReactNode;
}

export const RadioGroupItem = React.forwardRef<
  HTMLInputElement,
  RadioGroupItemProps
>(
  (
    {
      className,
      itemClassName,
      labelClassName,
      descriptionClassName,
      children,
      description,
      ...props
    },
    ref,
  ) => {
    return (
      <label className={cn('block cursor-pointer', className)}>
        <input ref={ref} type="radio" className="peer sr-only" {...props} />
        <span
          className={cn(
            'relative flex min-h-[108px] cursor-pointer flex-col justify-between rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-left shadow-sm transition duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface)] peer-checked:border-[var(--brand)] peer-checked:bg-[var(--surface-accent)] peer-checked:shadow-lg peer-checked:shadow-[color:var(--brand-shadow)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring-soft)]',
            itemClassName,
          )}
        >
          <span
            className={cn(
              'text-base font-semibold leading-tight text-[var(--foreground)]',
              labelClassName,
            )}
          >
            {children}
          </span>
          {description ? (
            <span
              className={cn(
                'mt-2 max-w-[30ch] text-sm leading-6 text-[var(--muted-foreground)]',
                descriptionClassName,
              )}
            >
              {description}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);

RadioGroupItem.displayName = 'RadioGroupItem';

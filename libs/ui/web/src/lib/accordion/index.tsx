import * as React from 'react';
import { cn } from '../utils';

export function Accordion({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('space-y-3', className)} {...props} />;
}

export const AccordionItem = React.forwardRef<
  HTMLDetailsElement,
  React.DetailsHTMLAttributes<HTMLDetailsElement>
>(({ className, ...props }, ref) => {
  return (
    <details
      ref={ref}
      className={cn(
        'group rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
      {...props}
    />
  );
});

AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => {
  return (
    <summary
      ref={ref}
      className={cn(
        'flex list-none cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left font-semibold text-slate-950 marker:hidden',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m6.5 9.5 5.5 5 5.5-5" />
      </svg>
    </summary>
  );
});

AccordionTrigger.displayName = 'AccordionTrigger';

export function AccordionContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('px-4 pb-4 text-sm leading-7 text-slate-600', className)} {...props} />;
}

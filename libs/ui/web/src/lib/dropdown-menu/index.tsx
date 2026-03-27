import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 10, collisionPadding = 12, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'z-60 min-w-[12rem] max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[1.25rem] border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)/0.96] p-1.5 text-[var(--foreground)] shadow-[0_22px_48px_var(--shadow-soft)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));

DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]',
      className,
    )}
    {...props}
  />
));

DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'group relative flex cursor-pointer select-none items-center rounded-[1rem] border border-transparent px-3 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-150 data-[highlighted]:border-[var(--border-strong)] data-[highlighted]:bg-[var(--surface-accent)] data-[highlighted]:text-[var(--foreground)] data-[highlighted]:shadow-[0_10px_24px_var(--shadow-soft)] focus:border-[var(--border-strong)] focus:bg-[var(--surface-accent)] focus:text-[var(--foreground)] focus:shadow-[0_10px_24px_var(--shadow-soft)] data-[disabled]:pointer-events-none data-[disabled]:cursor-default data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));

DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('mx-3 my-1.5 h-px bg-[var(--overlay-border)]', className)}
    {...props}
  />
));

DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

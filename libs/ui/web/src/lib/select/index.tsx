'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../utils';

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      <path d="m6.5 9.5 5.5 5 5.5-5" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      {...props}
    >
      <path d="M5 12.5 9.2 17 19 7.5" />
    </svg>
  );
}

type SelectContextValue = {
  value: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  setValue: (value: string) => void;
  registerOption: (value: string, label: string) => () => void;
  getOptionLabel: (value: string) => string | undefined;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(componentName: string): SelectContextValue {
  const context = React.useContext(SelectContext);

  if (!context) {
    throw new Error(`${componentName} must be used within Select.`);
  }

  return context;
}

type SelectProps = {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function useControllableStringState({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: string;
  defaultProp?: string;
  onChange?: (value: string) => void;
}): [string, (value: string) => void] {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultProp ?? '',
  );
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  return [value, setValue];
}

function useControllableBooleanState({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: boolean;
  defaultProp?: boolean;
  onChange?: (value: boolean) => void;
}): [boolean, (value: boolean) => void] {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultProp ?? false,
  );
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: boolean) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  return [value, setValue];
}

export function Select({
  children,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
}: SelectProps): React.ReactElement {
  const [value, setValueState] = useControllableStringState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange,
  });
  const [open, setOpen] = useControllableBooleanState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const optionLabelsRef = React.useRef(new Map<string, string>());
  const [, forceLabelsRefresh] = React.useReducer((count) => count + 1, 0);

  const registerOption = React.useCallback(
    (optionValue: string, label: string) => {
      optionLabelsRef.current.set(optionValue, label);
      forceLabelsRefresh();

      return () => undefined;
    },
    [],
  );

  const getOptionLabel = React.useCallback((optionValue: string) => {
    return optionLabelsRef.current.get(optionValue);
  }, []);

  const setValue = React.useCallback(
    (nextValue: string) => {
      setValueState(nextValue);
      setOpen(false);
    },
    [setOpen, setValueState],
  );

  return (
    <SelectContext.Provider
      value={{
        value,
        open,
        setOpen,
        setValue,
        registerOption,
        getOptionLabel,
      }}
    >
      <DropdownMenuPrimitive.Root
        modal={false}
        open={open}
        onOpenChange={setOpen}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </SelectContext.Provider>
  );
}

export const SelectGroup = DropdownMenuPrimitive.Group;

type SelectValueProps = React.ComponentPropsWithoutRef<'span'> & {
  placeholder?: React.ReactNode;
};

export const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(
  ({ className, placeholder, ...props }, ref) => {
    const { value, getOptionLabel } = useSelectContext('SelectValue');
    const selectedLabel = value ? getOptionLabel(value) : undefined;

    return (
      <span
        ref={ref}
        className={cn(
          'truncate',
          !selectedLabel && 'text-[var(--muted-foreground)]',
          className,
        )}
        {...props}
      >
        {selectedLabel ?? placeholder ?? null}
      </span>
    );
  },
);

SelectValue.displayName = 'SelectValue';

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'>
>(({ className, children, type = 'button', ...props }, ref) => {
  const { open } = useSelectContext('SelectTrigger');

  return (
    <DropdownMenuPrimitive.Trigger asChild>
      <button
        ref={ref}
        type={type}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      </button>
    </DropdownMenuPrimitive.Trigger>
  );
});

SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(
  (
    { className, sideOffset = 6, collisionPadding = 12, children, ...props },
    ref,
  ) => {
    const { value, setValue } = useSelectContext('SelectContent');

    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cn(
            'z-30 min-w-[max(14rem,var(--radix-dropdown-menu-trigger-width))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className,
          )}
          {...props}
        >
          <DropdownMenuPrimitive.RadioGroup
            value={value}
            onValueChange={setValue}
            className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto overscroll-contain"
          >
            {children}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    );
  },
);

SelectContent.displayName = 'SelectContent';

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-sm font-semibold text-[var(--muted-foreground)]',
      className,
    )}
    {...props}
  />
));

SelectLabel.displayName = 'SelectLabel';

type SelectItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.RadioItem
> & {
  textValue?: string;
};

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  SelectItemProps
>(({ className, children, textValue, value, ...props }, ref) => {
  const { registerOption } = useSelectContext('SelectItem');

  React.useEffect(() => {
    const fallbackLabel =
      textValue ??
      (typeof children === 'string' || typeof children === 'number'
        ? String(children)
        : undefined);

    if (!fallbackLabel) {
      return;
    }

    return registerOption(value, fallbackLabel);
  }, [children, registerOption, textValue, value]);

  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      value={value}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-9 pr-3 text-[15px] text-[var(--foreground)] outline-none transition-colors data-[highlighted]:bg-[var(--surface-accent)] data-[highlighted]:text-[var(--foreground)] data-[state=checked]:bg-[var(--surface-accent)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center text-[var(--brand)]">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

SelectItem.displayName = 'SelectItem';

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-[var(--border)]', className)}
    {...props}
  />
));

SelectSeparator.displayName = 'SelectSeparator';

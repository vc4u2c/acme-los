import React from 'react';
import { createInput } from '@gluestack-ui/core/input/creator';
import { PrimitiveIcon, UIIcon } from '@gluestack-ui/core/icon/creator';
import {
  tva,
  type VariantProps,
  useStyleContext,
  withStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import { cssInterop } from 'nativewind';
import { Pressable, TextInput } from 'react-native';
import { useGluestackThemeMode } from '../gluestack-ui-provider/theme-mode';

const SCOPE = 'INPUT';

const Root = withStyleContext(Pressable, SCOPE);

const GluestackInput = createInput({
  Root,
  Slot: Pressable,
  Input: TextInput,
  Icon: UIIcon,
});

cssInterop(PrimitiveIcon, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      color: 'classNameColor',
      fill: true,
      height: true,
      stroke: true,
      width: true,
    },
  },
});

const inputRootStyle = tva({
  base: 'flex-row items-center gap-3 rounded-2xl border border-outline-300 bg-background-100 px-4 shadow-sm data-[focus=true]:border-primary-400 data-[focus=true]:bg-background-50 data-[invalid=true]:border-error-500 data-[disabled=true]:opacity-50',
  variants: {
    size: {
      sm: 'min-h-11',
      md: 'min-h-13',
      lg: 'min-h-15',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const inputFieldStyle = tva({
  base: 'flex-1 bg-transparent font-medium leading-6 web:outline-none',
  parentVariants: {
    size: {
      sm: 'text-sm py-2.5',
      md: 'text-base py-3',
      lg: 'text-lg py-3.5',
    },
  },
});

const inputSlotStyle = tva({
  base: 'items-center justify-center',
  parentVariants: {
    size: {
      sm: 'mr-2',
      md: 'mr-3',
      lg: 'mr-3',
    },
  },
});

const inputIconStyle = tva({
  base: 'text-typography-500',
  parentVariants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-5 w-5',
    },
  },
});

type InputRootProps = Omit<
  React.ComponentPropsWithoutRef<typeof GluestackInput>,
  'context'
> &
  VariantProps<typeof inputRootStyle> & {
    className?: string;
  };

const Input = React.forwardRef<
  React.ElementRef<typeof GluestackInput>,
  InputRootProps
>(({ className, size = 'md', ...props }, ref) => {
  const mode = useGluestackThemeMode();
  const textColorClass = mode === 'dark' ? 'text-white' : 'text-black';

  return (
    <GluestackInput
      ref={ref}
      className={inputRootStyle({
        size,
        class: `${textColorClass} ${className ?? ''}`.trim(),
      })}
      context={{ size }}
      {...props}
    />
  );
});

type InputFieldProps = React.ComponentPropsWithoutRef<
  typeof GluestackInput.Input
> &
  VariantProps<typeof inputFieldStyle> & {
    className?: string;
  };

const InputField = React.forwardRef<
  React.ElementRef<typeof GluestackInput.Input>,
  InputFieldProps
>(({ className, size, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE);
  const mode = useGluestackThemeMode();
  const textColor = mode === 'dark' ? '#FEFEFF' : '#171717';
  const placeholderTextColor =
    props.placeholderTextColor ?? (mode === 'dark' ? '#94A3B8' : '#737373');

  return (
    <GluestackInput.Input
      ref={ref}
      placeholderTextColor={placeholderTextColor}
      style={[{ color: textColor }, props.style]}
      className={inputFieldStyle({
        parentVariants: { size: parentSize },
        size,
        class: className,
      })}
      {...props}
    />
  );
});

type InputSlotProps = React.ComponentPropsWithoutRef<
  typeof GluestackInput.Slot
> &
  VariantProps<typeof inputSlotStyle> & {
    className?: string;
  };

const InputSlot = React.forwardRef<
  React.ElementRef<typeof GluestackInput.Slot>,
  InputSlotProps
>(({ className, size, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <GluestackInput.Slot
      ref={ref}
      className={inputSlotStyle({
        parentVariants: { size: parentSize },
        size,
        class: className,
      })}
      {...props}
    />
  );
});

type InputIconProps = React.ComponentPropsWithoutRef<
  typeof GluestackInput.Icon
> &
  VariantProps<typeof inputIconStyle> & {
    as?: React.ElementType;
    className?: string;
  };

const InputIcon = React.forwardRef<
  React.ElementRef<typeof GluestackInput.Icon>,
  InputIconProps
>(({ className, size, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <GluestackInput.Icon
      ref={ref}
      className={inputIconStyle({
        parentVariants: { size: parentSize },
        size,
        class: className,
      })}
      {...props}
    />
  );
});

Input.displayName = 'Input';
InputField.displayName = 'InputField';
InputSlot.displayName = 'InputSlot';
InputIcon.displayName = 'InputIcon';

export { Input, InputField, InputIcon, InputSlot };

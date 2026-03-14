import React from 'react';
import { createTextarea } from '@gluestack-ui/core/textarea/creator';
import {
  tva,
  type VariantProps,
  useStyleContext,
  withStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import { TextInput, View } from 'react-native';
import { useGluestackThemeMode } from '../gluestack-ui-provider/theme-mode';

const SCOPE = 'TEXTAREA';

const Root = withStyleContext(View, SCOPE);

const GluestackTextarea = createTextarea({
  Root,
  Input: TextInput,
});

const textareaRootStyle = tva({
  base: 'rounded-2xl border border-outline-300 bg-background-100 px-4 py-4 shadow-sm data-[focus=true]:border-primary-400 data-[focus=true]:bg-background-50 data-[invalid=true]:border-error-500 data-[disabled=true]:opacity-50',
  variants: {
    size: {
      md: 'min-h-32',
      lg: 'min-h-40',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const textareaFieldStyle = tva({
  base: 'w-full flex-1 bg-transparent text-base font-medium leading-7 web:outline-none',
  parentVariants: {
    size: {
      md: 'min-h-24',
      lg: 'min-h-32',
    },
  },
});

type TextareaProps = Omit<
  React.ComponentPropsWithoutRef<typeof GluestackTextarea>,
  'context'
> &
  VariantProps<typeof textareaRootStyle> & {
    className?: string;
  };

const Textarea = React.forwardRef<
  React.ElementRef<typeof GluestackTextarea>,
  TextareaProps
>(({ className, size = 'md', ...props }, ref) => {
  const mode = useGluestackThemeMode();
  const textColorClass = mode === 'dark' ? 'text-white' : 'text-black';

  return (
    <GluestackTextarea
      ref={ref}
      className={textareaRootStyle({
        size,
        class: `${textColorClass} ${className ?? ''}`.trim(),
      })}
      context={{ size }}
      {...props}
    />
  );
});

type TextareaInputProps = React.ComponentPropsWithoutRef<
  typeof GluestackTextarea.Input
> &
  VariantProps<typeof textareaFieldStyle> & {
    className?: string;
  };

const TextareaInput = React.forwardRef<
  React.ElementRef<typeof GluestackTextarea.Input>,
  TextareaInputProps
>(({ className, size, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE);
  const mode = useGluestackThemeMode();
  const textColor = mode === 'dark' ? '#FEFEFF' : '#171717';
  const placeholderTextColor =
    props.placeholderTextColor ?? (mode === 'dark' ? '#94A3B8' : '#737373');

  return (
    <GluestackTextarea.Input
      ref={ref}
      multiline={props.multiline ?? true}
      placeholderTextColor={placeholderTextColor}
      style={[{ color: textColor }, props.style]}
      textAlignVertical="top"
      className={textareaFieldStyle({
        parentVariants: { size: parentSize },
        size,
        class: className,
      })}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';
TextareaInput.displayName = 'TextareaInput';

export { Textarea, TextareaInput };

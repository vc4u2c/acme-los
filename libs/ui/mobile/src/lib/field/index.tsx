import React from 'react';
import { Text, View } from 'react-native';

type ViewProps = React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
};

type TextProps = React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
};

export function Field({
  className = '',
  ...props
}: ViewProps): React.ReactElement {
  return <View className={`gap-2 ${className}`.trim()} {...props} />;
}

export function FieldLabel({
  className = '',
  ...props
}: TextProps): React.ReactElement {
  return (
    <Text
      className={`text-xs font-semibold uppercase tracking-[2px] text-typography-500 ${className}`.trim()}
      {...props}
    />
  );
}

export function FieldHint({
  className = '',
  ...props
}: TextProps): React.ReactElement {
  return (
    <Text
      className={`text-sm leading-5 text-typography-600 ${className}`.trim()}
      {...props}
    />
  );
}

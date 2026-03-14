import React from 'react';
import { Text, View } from 'react-native';

type BaseProps = React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
};

export function Card({
  className = '',
  ...props
}: BaseProps): React.ReactElement {
  return (
    <View
      className={`overflow-hidden rounded-3xl border border-outline-200 bg-background-50 p-6 shadow-sm ${className}`.trim()}
      {...props}
    />
  );
}

export function CardHeader({
  className = '',
  ...props
}: BaseProps): React.ReactElement {
  return <View className={`mb-4 gap-2 ${className}`.trim()} {...props} />;
}

export function CardContent({
  className = '',
  ...props
}: BaseProps): React.ReactElement {
  return <View className={`gap-4 ${className}`.trim()} {...props} />;
}

export function CardFooter({
  className = '',
  ...props
}: BaseProps): React.ReactElement {
  return <View className={`mt-4 ${className}`.trim()} {...props} />;
}

export function CardTitle({
  className = '',
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
}): React.ReactElement {
  return (
    <Text
      className={`text-xl font-semibold text-typography-950 ${className}`.trim()}
      {...props}
    />
  );
}

export function CardDescription({
  className = '',
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
}): React.ReactElement {
  return (
    <Text
      className={`text-sm leading-6 text-typography-600 ${className}`.trim()}
      {...props}
    />
  );
}

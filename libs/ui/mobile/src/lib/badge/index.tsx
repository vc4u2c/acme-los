import React from 'react';
import { Text, View } from 'react-native';

type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger';

const badgeClasses: Record<BadgeVariant, string> = {
  default: 'bg-secondary-100',
  info: 'bg-info-100',
  success: 'bg-success-100',
  warning: 'bg-warning-100',
  danger: 'bg-error-100',
};

const badgeTextClasses: Record<BadgeVariant, string> = {
  default: 'text-typography-800',
  info: 'text-info-800',
  success: 'text-success-800',
  warning: 'text-warning-800',
  danger: 'text-error-800',
};

export function Badge({
  className = '',
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
  variant?: BadgeVariant;
}): React.ReactElement {
  return (
    <View
      className={`self-start rounded-full px-3 py-1 ${badgeClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}

export function BadgeText({
  className = '',
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
  variant?: BadgeVariant;
}): React.ReactElement {
  return (
    <Text
      className={`text-xs font-semibold uppercase tracking-[2px] ${badgeTextClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}

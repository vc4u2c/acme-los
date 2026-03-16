import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ViewProps = React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
};

type TextProps = React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
};

type ScrollProps = React.ComponentPropsWithoutRef<typeof ScrollView> & {
  className?: string;
  contentContainerClassName?: string;
};

export function Screen({
  className = '',
  contentContainerClassName = '',
  showsVerticalScrollIndicator = false,
  testID = 'mobile-app-shell',
  ...props
}: ScrollProps): React.ReactElement {
  return (
    <ScrollView
      className={`flex-1 bg-background-0 ${className}`.trim()}
      contentContainerClassName={`min-h-full px-4 py-8 pb-14 sm:px-6 sm:py-10 sm:pb-16 lg:px-8 ${contentContainerClassName}`.trim()}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      testID={testID}
      {...props}
    />
  );
}

export function ScreenContent({
  className = '',
  ...props
}: ViewProps): React.ReactElement {
  return (
    <View
      className={`mx-auto w-full max-w-6xl gap-6 ${className}`.trim()}
      {...props}
    />
  );
}

export function ScreenHeader({
  className = '',
  ...props
}: ViewProps): React.ReactElement {
  return <View className={`gap-4 ${className}`.trim()} {...props} />;
}

export function ScreenEyebrow({
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

export function ScreenTitle({
  className = '',
  ...props
}: TextProps): React.ReactElement {
  return (
    <Text
      className={`max-w-3xl text-4xl font-semibold leading-tight text-typography-950 ${className}`.trim()}
      {...props}
    />
  );
}

export function ScreenDescription({
  className = '',
  ...props
}: TextProps): React.ReactElement {
  return (
    <Text
      className={`max-w-3xl text-base leading-7 text-typography-600 ${className}`.trim()}
      {...props}
    />
  );
}

export function ScreenSection({
  className = '',
  ...props
}: ViewProps): React.ReactElement {
  return <View className={`gap-3 ${className}`.trim()} {...props} />;
}

export function ScreenGrid({
  className = '',
  ...props
}: ViewProps): React.ReactElement {
  return (
    <View
      className={`gap-4 md:flex-row md:flex-wrap ${className}`.trim()}
      {...props}
    />
  );
}

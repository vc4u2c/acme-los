import { View } from 'react-native';
import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Screen,
  ScreenContent,
  ScreenDescription,
  ScreenEyebrow,
  ScreenGrid,
  ScreenHeader,
  ScreenSection,
  ScreenTitle,
} from '@acme-los/ui-mobile';

export function MobileHomeScreen({
  mobileAppVersion,
  onOpenShowcase,
}: {
  mobileAppVersion: string;
  onOpenShowcase: () => void;
}): React.ReactElement {
  return (
    <Screen contentContainerClassName="justify-center">
      <ScreenContent>
        <ScreenHeader>
          <Badge variant="info">
            <BadgeText variant="info">Mobile Home</BadgeText>
          </Badge>
          <ScreenTitle>Shared primitives, ready for feature work</ScreenTitle>
          <ScreenDescription>
            This is the landing screen for the mobile app. Keep the home surface
            calm and focused, then jump into the showcase when you want to
            inspect the shared UI building blocks more closely.
          </ScreenDescription>
        </ScreenHeader>

        <Card className="border-outline-300 bg-background-100">
          <CardHeader className="gap-3">
            <ScreenEyebrow>Overview</ScreenEyebrow>
            <CardTitle testID="heading">Welcome mobile-app</CardTitle>
            <ScreenDescription>
              The shared mobile library now covers cards, badges, inputs,
              textareas, and buttons with a cleaner path for exploring them.
            </ScreenDescription>
          </CardHeader>
          <CardContent className="gap-6">
            <ScreenGrid>
              <View className="flex-1 gap-2 rounded-2xl border border-success-300 bg-background-success p-4 md:min-w-[260px]">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge variant="warning">
                    <BadgeText variant="warning">Release</BadgeText>
                  </Badge>
                  <ScreenTitle className="text-xl leading-tight">
                    {`Mobile app v${mobileAppVersion}`}
                  </ScreenTitle>
                </View>
                <ScreenDescription className="text-sm leading-6">
                  Shared primitives are ready for app-level review.
                </ScreenDescription>
              </View>

              <View className="flex-1 gap-2 rounded-2xl border border-info-300 bg-background-info p-4 md:min-w-[260px]">
                <Badge variant="info">
                  <BadgeText variant="info">Destination</BadgeText>
                </Badge>
                <ScreenTitle className="text-2xl">Showcase</ScreenTitle>
                <ScreenDescription className="text-sm leading-6">
                  A dedicated gallery for inspecting reusable mobile UI.
                </ScreenDescription>
              </View>
            </ScreenGrid>

            <ScreenSection className="gap-5 rounded-3xl border border-primary-300 bg-background-50 p-6 shadow-lg">
              <View className="gap-2">
                <Badge variant="info">
                  <BadgeText variant="info">Navigation</BadgeText>
                </Badge>
                <ScreenTitle className="text-2xl">
                  Open the mobile showcase
                </ScreenTitle>
                <ScreenDescription className="text-sm leading-6 text-typography-900">
                  Review the shared cards, form controls, and status markers in
                  one place before reusing them across feature screens.
                </ScreenDescription>
              </View>
              <View className="w-full max-w-sm">
                <Button
                  size="xl"
                  action="primary"
                  className="w-full border border-primary-400 shadow-xl"
                  onPress={onOpenShowcase}
                >
                  <ButtonText>Open mobile showcase</ButtonText>
                </Button>
              </View>
            </ScreenSection>
          </CardContent>
        </Card>

        <ScreenSection className="gap-3">
          <ScreenEyebrow>Included building blocks</ScreenEyebrow>
          <View className="flex-row flex-wrap gap-3">
            <Badge>
              <BadgeText>Card</BadgeText>
            </Badge>
            <Badge variant="info">
              <BadgeText variant="info">Input</BadgeText>
            </Badge>
            <Badge variant="success">
              <BadgeText variant="success">Textarea</BadgeText>
            </Badge>
            <Badge variant="warning">
              <BadgeText variant="warning">Badge</BadgeText>
            </Badge>
          </View>
        </ScreenSection>
      </ScreenContent>
    </Screen>
  );
}

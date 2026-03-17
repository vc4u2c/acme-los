import { View } from 'react-native';
import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Screen,
  ScreenContent,
  ScreenDescription,
  ScreenEyebrow,
  ScreenGrid,
  ScreenHeader,
  ScreenTitle,
} from '@acme-los/ui-mobile';

const previewSteps = [
  {
    step: '1',
    label: 'Personal info',
    copy: 'Lead with identity and address so the customer understands the shape of the request.',
  },
  {
    step: '2',
    label: 'Disclosures',
    copy: 'Show timing, consent, and funding expectations before the application asks for more trust.',
  },
  {
    step: '3',
    label: 'Income and banking',
    copy: 'Sensitive details arrive later, once the path and next handoff already feel clear.',
  },
];

const dashboardHighlights = [
  {
    eyebrow: 'Talk to us',
    title: 'Support stays visible',
    copy: 'Keep help, rates, and timing cues easy to reach without forcing the customer out of the shell.',
  },
  {
    eyebrow: 'Pause when needed',
    title: 'Progress feels readable',
    copy: 'A calmer first screen helps customers resume the application without feeling like they are jumping back into a wall of questions.',
  },
  {
    eyebrow: 'See the path',
    title: 'Preview before trust',
    copy: 'Set expectations up front, then move into the showcase when you need to inspect the shared mobile components.',
  },
];

function BrandMark(): React.ReactElement {
  return (
    <View className="relative h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-lg shadow-black/20">
      <ScreenTitle className="text-3xl font-semibold text-typography-0">
        A
      </ScreenTitle>
      <View className="absolute right-3 top-3 h-2.5 w-2.5 rounded-sm bg-primary-200 opacity-85" />
    </View>
  );
}

export function DashboardScreen({
  mobileAppVersion,
  onOpenShowcase,
}: {
  mobileAppVersion: string;
  onOpenShowcase: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <ScreenContent>
        <ScreenHeader className="gap-5">
          <View className="flex-row items-center gap-4">
            <BrandMark />
            <View className="flex-1 gap-1">
              <ScreenEyebrow className="text-primary-700">
                ACME LOS
              </ScreenEyebrow>
              <ScreenTitle className="text-3xl">Installment flow</ScreenTitle>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Badge variant="info">
              <BadgeText variant="info">Dashboard</BadgeText>
            </Badge>
            <Badge variant="warning">
              <BadgeText variant="warning">{`Mobile App v${mobileAppVersion}`}</BadgeText>
            </Badge>
          </View>
          <ScreenTitle testID="heading">
            A steadier installment application from first answer to funding.
          </ScreenTitle>
          <ScreenDescription>
            Lead with identity and disclosures, keep support in view, and move
            through income, banking, pre-approval, signing, and funding with
            fewer surprises late in the journey.
          </ScreenDescription>
          <View className="flex-row flex-wrap gap-3">
            <Button
              size="lg"
              action="primary"
              className="border border-primary-300 shadow-lg"
              onPress={onOpenShowcase}
            >
              <ButtonText>Open mobile showcase</ButtonText>
            </Button>
            <Button
              size="lg"
              action="primary"
              variant="outline"
              className="border border-outline-300 bg-background-50"
              onPress={onOpenShowcase}
            >
              <ButtonText>Inspect the library</ButtonText>
            </Button>
          </View>
        </ScreenHeader>

        <ScreenGrid className="items-start">
          {dashboardHighlights.map((item) => (
            <Card
              key={item.title}
              className="flex-1 border-outline-300 bg-background-100 md:min-w-[220px]"
            >
              <CardHeader className="gap-2">
                <ScreenEyebrow>{item.eyebrow}</ScreenEyebrow>
                <CardTitle className="text-2xl">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScreenDescription className="text-sm leading-6">
                  {item.copy}
                </ScreenDescription>
              </CardContent>
            </Card>
          ))}
        </ScreenGrid>

        <Card className="border-outline-300 bg-background-100 shadow-xl">
          <CardHeader className="gap-2">
            <ScreenEyebrow>Process preview</ScreenEyebrow>
            <CardTitle>A seven-step flow with no sudden jumps.</CardTitle>
            <CardDescription className="text-sm leading-6">
              Move from basics to disclosures, then into income, banking,
              pre-approval, signing, and funding. Each stage should explain what
              comes next before the application asks for more.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            {previewSteps.map((item) => (
              <View
                key={item.step}
                className="flex-row items-start gap-4 rounded-3xl border border-outline-200 bg-background-0 px-4 py-4"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-600">
                  <ScreenTitle className="text-lg font-semibold text-typography-0">
                    {item.step}
                  </ScreenTitle>
                </View>
                <View className="flex-1 gap-1">
                  <ScreenTitle className="text-2xl leading-tight">
                    {item.label}
                  </ScreenTitle>
                  <ScreenDescription className="text-sm leading-6">
                    {item.copy}
                  </ScreenDescription>
                </View>
              </View>
            ))}
          </CardContent>
          <CardFooter className="gap-4 border-t border-outline-200 pt-5">
            <View className="flex-row flex-wrap gap-3">
              <Badge>
                <BadgeText>Cards</BadgeText>
              </Badge>
              <Badge variant="info">
                <BadgeText variant="info">Inputs</BadgeText>
              </Badge>
              <Badge variant="success">
                <BadgeText variant="success">Textareas</BadgeText>
              </Badge>
              <Badge variant="warning">
                <BadgeText variant="warning">Status badges</BadgeText>
              </Badge>
            </View>
            <View className="w-full max-w-sm">
              <Button
                size="lg"
                action="primary"
                variant="outline"
                className="w-full border border-outline-300 bg-background-50"
                onPress={onOpenShowcase}
              >
                <ButtonText>Open the component library</ButtonText>
              </Button>
            </View>
          </CardFooter>
        </Card>
      </ScreenContent>
    </Screen>
  );
}

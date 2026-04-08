import { Text, View } from 'react-native';
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
  Field,
  FieldHint,
  FieldLabel,
  Input,
  InputField,
  Screen,
  ScreenContent,
  ScreenDescription,
  ScreenEyebrow,
  ScreenGrid,
  ScreenHeader,
  ScreenSection,
  ScreenTitle,
  Textarea,
  TextareaInput,
} from '@acme-los/ui-mobile';

export function ShowcaseScreen({
  mobileAppVersion,
  mobileAppBuild,
  mobileAppEnvironment,
  onBack,
}: {
  mobileAppVersion: string;
  mobileAppBuild?: string;
  mobileAppEnvironment: string;
  onBack?: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <ScreenContent>
        <ScreenHeader>
          {onBack ? (
            <View className="w-full max-w-[220px]">
              <Button
                action="primary"
                variant="outline"
                className="border border-outline-300 bg-background-50"
                onPress={onBack}
              >
                <ButtonText>Back to dashboard</ButtonText>
              </Button>
            </View>
          ) : null}
          <Badge variant="info">
            <BadgeText variant="info">Mobile Showcase</BadgeText>
          </Badge>
          <Badge variant="warning">
            <BadgeText variant="warning">{mobileAppEnvironment}</BadgeText>
          </Badge>
          {mobileAppBuild ? (
            <Badge>
              <BadgeText>{`Build ${mobileAppBuild}`}</BadgeText>
            </Badge>
          ) : null}
          <ScreenTitle>Clean mobile primitives, one place</ScreenTitle>
          <ScreenDescription>
            A compact gallery for checking shared mobile UI before it spreads
            across feature screens.
          </ScreenDescription>
        </ScreenHeader>

        <Card className="border-outline-300 bg-background-100">
          <CardHeader>
            <ScreenEyebrow>Showcase</ScreenEyebrow>
            <CardTitle>Gluestack primitives in one place</CardTitle>
            <ScreenDescription className="text-sm leading-6">
              This screen acts as a compact reference surface for the shared
              mobile primitives in `@acme-los/ui-mobile`.
            </ScreenDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary-700">
              Mobile version v{mobileAppVersion}
            </Text>
            <ScreenDescription className="text-sm leading-6">
              Cards, badges, inputs, textareas, and buttons should all render
              cleanly here before we reuse them across feature screens.
            </ScreenDescription>
            <ScreenGrid>
              <View className="flex-1 gap-2 rounded-2xl border border-outline-200 bg-background-0 p-4 md:min-w-[260px]">
                <ScreenEyebrow>Surface</ScreenEyebrow>
                <ScreenDescription className="text-sm leading-6">
                  Rounded cards and section spacing should feel deliberate, not
                  improvised.
                </ScreenDescription>
              </View>
              <View className="flex-1 gap-2 rounded-2xl border border-outline-200 bg-background-0 p-4 md:min-w-[260px]">
                <ScreenEyebrow>Content</ScreenEyebrow>
                <ScreenDescription className="text-sm leading-6">
                  Form inputs and status markers should read clearly at a
                  glance.
                </ScreenDescription>
              </View>
            </ScreenGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Input primitives</CardTitle>
            <CardDescription>
              Form building blocks for release settings and operational
              workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Field>
              <FieldLabel>Release owner</FieldLabel>
              <Input>
                <InputField
                  placeholder="Release owner"
                  defaultValue="ACME Ops"
                />
              </Input>
              <FieldHint>Primary team responsible for the rollout.</FieldHint>
            </Field>
            <Field>
              <FieldLabel>Notification email</FieldLabel>
              <Input>
                <InputField
                  placeholder="Notification email"
                  defaultValue="team@acme-los.dev"
                  keyboardType="email-address"
                />
              </Input>
              <FieldHint>
                Where deployment updates and alerts should land.
              </FieldHint>
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea>
                <TextareaInput
                  placeholder="Notes"
                  defaultValue={
                    'Release notes\n- QA sign-off complete\n- Awaiting final production approval\n- Copy now uses a more readable multiline rhythm'
                  }
                />
              </Textarea>
              <FieldHint>
                Use multiline input for setup notes and release context.
              </FieldHint>
            </Field>
          </CardContent>
          <CardFooter className="gap-3 border-t border-outline-200 pt-5">
            <ScreenDescription className="text-sm leading-6 text-typography-900">
              Save the current release draft once the owner, notifications, and
              notes look right.
            </ScreenDescription>
            <View className="w-full max-w-sm">
              <Button
                size="xl"
                className="w-full border border-primary-400 shadow-xl"
              >
                <ButtonText>Save draft settings</ButtonText>
              </Button>
            </View>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges and status</CardTitle>
            <CardDescription>
              Compact markers for rollout status, approvals, and environment
              labeling.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row flex-wrap gap-3">
              <Badge>
                <BadgeText>Default</BadgeText>
              </Badge>
              <Badge variant="info">
                <BadgeText variant="info">Info</BadgeText>
              </Badge>
              <Badge variant="success">
                <BadgeText variant="success">Ready</BadgeText>
              </Badge>
              <Badge variant="warning">
                <BadgeText variant="warning">Pending</BadgeText>
              </Badge>
            </View>
            <ScreenSection className="rounded-2xl border border-outline-200 bg-background-0 p-4">
              <ScreenEyebrow>Status notes</ScreenEyebrow>
              <ScreenDescription className="text-sm leading-6">
                Keep status colors compact and meaningful so they support the
                screen instead of overwhelming it.
              </ScreenDescription>
            </ScreenSection>
          </CardContent>
        </Card>
      </ScreenContent>
    </Screen>
  );
}

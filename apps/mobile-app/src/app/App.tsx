import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ButtonText, GluestackUIProvider } from '@acme-los/ui-mobile';

const checklist = [
  'Expo app bootstraps through Nx',
  'Tailwind classes compile through NativeWind',
  'Shared UI can move into libs/ui/mobile once the base works',
];

export const App = () => {
  return (
    <GluestackUIProvider mode="dark">
      <SafeAreaView className="flex-1 bg-background-0">
        <StatusBar style="light" />

        <View className="flex-1 justify-center px-6 py-10">
          <View className="rounded-3xl border border-outline-200 bg-background-50 px-6 py-8">
            <View className="mb-5 self-start rounded-full bg-primary-100 px-3 py-1">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-typography-950">
                Gluestack Foundation
              </Text>
            </View>

            <Text
              testID="heading"
              className="text-4xl font-bold text-typography-950"
            >
              NativeWind plus gluestack are wired for mobile
            </Text>

            <Text className="mt-4 text-base leading-6 text-typography-700">
              This screen is running inside the official gluestack provider and
              using token-driven Tailwind classes. Once this renders correctly
              in Expo, the mobile theming base is working.
            </Text>

            <View className="mt-8 gap-3">
              {checklist.map((item) => (
                <View
                  key={item}
                  className="rounded-2xl border border-outline-100 bg-background-100 px-4 py-3"
                >
                  <Text className="text-sm text-typography-800">{item}</Text>
                </View>
              ))}
            </View>

            <Button className="mt-8" size="lg">
              <ButtonText>First gluestack button primitive is live</ButtonText>
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </GluestackUIProvider>
  );
};

export default App;

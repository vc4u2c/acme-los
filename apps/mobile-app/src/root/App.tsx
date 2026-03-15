import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '@acme-los/ui-mobile';
import { mobileAppRelease } from '../lib/app-release';
import { MobileHomeScreen } from './screens/mobile-home-screen';
import { MobileShowcaseScreen } from './screens/mobile-showcase-screen';

type RootStackParamList = {
  home: undefined;
  showcase: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0B1220',
    border: '#253247',
    card: '#111A2B',
    notification: '#469EDA',
    primary: '#72B6E6',
    text: '#FEFEFF',
  },
};

function HomeRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'home'>): React.ReactElement {
  return (
    <MobileHomeScreen
      mobileAppVersion={mobileAppRelease.version}
      onOpenShowcase={() => navigation.navigate('showcase')}
    />
  );
}

function ShowcaseRoute(): React.ReactElement {
  return <MobileShowcaseScreen mobileAppVersion={mobileAppRelease.version} />;
}

export const App = () => {
  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode="dark">
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="home"
            screenOptions={{
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: '#0B1220' },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: '#111A2B' },
              headerTintColor: '#FEFEFF',
              headerTitleStyle: {
                color: '#FEFEFF',
                fontSize: 18,
                fontWeight: '600',
              },
            }}
          >
            <Stack.Screen
              name="home"
              component={HomeRoute}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="showcase"
              component={ShowcaseRoute}
              options={{
                headerBackButtonDisplayMode: 'minimal',
                title: 'Mobile Showcase',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
};

export default App;

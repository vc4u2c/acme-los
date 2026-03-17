import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import {
  DefaultTheme,
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '@acme-los/ui-mobile';
import { mobileAppRelease } from '../lib/app-release';
import { DashboardScreen } from './screens/dashboard-screen';
import { ShowcaseScreen } from './screens/showcase-screen';

type RootStackParamList = {
  dashboard: undefined;
  showcase: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const lightNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FCFAF6',
    border: '#C7D3C8',
    card: '#F4F6F1',
    notification: '#D6B05F',
    primary: '#116243',
    text: '#17312A',
  },
};

const darkNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#101B19',
    border: '#2A423D',
    card: '#142321',
    notification: '#D4AE60',
    primary: '#46A67A',
    text: '#F4EFE6',
  },
};

function DashboardRoute({
  navigation,
}: NativeStackScreenProps<
  RootStackParamList,
  'dashboard'
>): React.ReactElement {
  return (
    <DashboardScreen
      mobileAppVersion={mobileAppRelease.version}
      onOpenShowcase={() => navigation.navigate('showcase')}
    />
  );
}

function ShowcaseRoute(): React.ReactElement {
  return <ShowcaseScreen mobileAppVersion={mobileAppRelease.version} />;
}

export const App = () => {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const navigationTheme =
    mode === 'dark' ? darkNavigationTheme : lightNavigationTheme;

  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode={mode}>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <Stack.Navigator
            initialRouteName="dashboard"
            screenOptions={{
              animation: 'slide_from_right',
              contentStyle: {
                backgroundColor: navigationTheme.colors.background,
              },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: navigationTheme.colors.card },
              headerTintColor: navigationTheme.colors.text,
              headerTitleStyle: {
                color: navigationTheme.colors.text,
                fontSize: 18,
                fontWeight: '600',
              },
            }}
          >
            <Stack.Screen
              name="dashboard"
              component={DashboardRoute}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="showcase"
              component={ShowcaseRoute}
              options={{
                headerBackButtonDisplayMode: 'minimal',
                title: 'Showcase',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
};

export default App;

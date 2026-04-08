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
import { Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '@acme-los/ui-mobile';
import { mobileAppRelease } from '../lib/app-release';
import { DashboardScreen } from './screens/dashboard-screen';
import { ShowcaseScreen } from './screens/showcase-screen';

type RootStackParamList = {
  dashboard: undefined;
  showcase: undefined;
};

type WebRoute = keyof RootStackParamList;

const NativeStack = createNativeStackNavigator<RootStackParamList>();

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

function getInitialWebRoute(): WebRoute {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  return window.location.hash === '#showcase' ? 'showcase' : 'dashboard';
}

function DashboardRoute({
  navigation,
}: NativeStackScreenProps<
  RootStackParamList,
  'dashboard'
>): React.ReactElement {
  return (
    <DashboardScreen
      mobileAppVersion={mobileAppRelease.version}
      mobileAppBuild={
        mobileAppRelease.showBuildBadge ? mobileAppRelease.buildId : undefined
      }
      mobileAppEnvironment={mobileAppRelease.environmentBadgeLabel}
      onOpenShowcase={() => navigation.navigate('showcase')}
    />
  );
}

function ShowcaseRoute(): React.ReactElement {
  return (
    <ShowcaseScreen
      mobileAppVersion={mobileAppRelease.version}
      mobileAppBuild={
        mobileAppRelease.showBuildBadge ? mobileAppRelease.buildId : undefined
      }
      mobileAppEnvironment={mobileAppRelease.environmentBadgeLabel}
    />
  );
}

function WebAppShell(): React.ReactElement {
  const [route, setRoute] = React.useState<WebRoute>(() =>
    getInitialWebRoute(),
  );

  React.useEffect(() => {
    const syncRoute = () => {
      setRoute(getInitialWebRoute());
    };

    window.addEventListener('hashchange', syncRoute);

    return () => {
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const navigate = React.useCallback((nextRoute: WebRoute) => {
    window.location.hash = nextRoute === 'showcase' ? 'showcase' : 'dashboard';
  }, []);

  if (route === 'showcase') {
    return (
      <ShowcaseScreen
        mobileAppVersion={mobileAppRelease.version}
        mobileAppBuild={
          mobileAppRelease.showBuildBadge ? mobileAppRelease.buildId : undefined
        }
        mobileAppEnvironment={mobileAppRelease.environmentBadgeLabel}
        onBack={() => navigate('dashboard')}
      />
    );
  }

  return (
    <DashboardScreen
      mobileAppVersion={mobileAppRelease.version}
      mobileAppBuild={
        mobileAppRelease.showBuildBadge ? mobileAppRelease.buildId : undefined
      }
      mobileAppEnvironment={mobileAppRelease.environmentBadgeLabel}
      onOpenShowcase={() => navigate('showcase')}
    />
  );
}

function NativeNavigator({
  navigationTheme,
}: {
  navigationTheme: Theme;
}): React.ReactElement {
  return (
    <NativeStack.Navigator
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
      <NativeStack.Screen
        name="dashboard"
        component={DashboardRoute}
        options={{ headerShown: false }}
      />
      <NativeStack.Screen
        name="showcase"
        component={ShowcaseRoute}
        options={{
          headerBackButtonDisplayMode: 'minimal',
          title: 'Showcase',
        }}
      />
    </NativeStack.Navigator>
  );
}

export const App = () => {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const isWeb = Platform.OS === 'web';
  const navigationTheme =
    mode === 'dark' ? darkNavigationTheme : lightNavigationTheme;

  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode={mode}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        {isWeb ? (
          <WebAppShell />
        ) : (
          <NavigationContainer theme={navigationTheme}>
            <NativeNavigator navigationTheme={navigationTheme} />
          </NavigationContainer>
        )}
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
};

export default App;

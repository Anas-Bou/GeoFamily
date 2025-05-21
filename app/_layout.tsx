import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React from 'react'; // Import React
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext'; // Import AuthProvider and useAuth

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function InitialLayout() {
  // Remove local colorScheme, it's handled in RootLayout
  const { isAuthenticated } = useAuth(); // Use the context hook
  const segments = useSegments();
  const router = useRouter();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;

    const inAuthGroup = segments[0] === '(auth)'; // Keep this check for context

    // If the user is not authenticated, redirect to the login screen.
    if (!isAuthenticated) {
       // Only redirect if not already in the auth group to avoid loops
      if (!inAuthGroup) {
         router.replace('/(auth)/login');
      }
    } else {
      // If the user is authenticated and perhaps landed in the auth group somehow,
      // If the user is authenticated and somehow landed in the auth group,
      // redirect them to the main app area (e.g., the first tab).
      if (inAuthGroup) {
         router.replace('/(tabs)'); // Redirect authenticated users out of auth flow
      }
    }
  }, [loaded, isAuthenticated, segments, router]);


  if (!loaded) {
    return null; // Or a loading indicator
  }

  return (
      // Use Stack navigator
      <Stack>
        {/* Define screens for the auth flow, hide headers */}
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/signup" options={{ title: 'Sign Up', headerBackTitle: 'Login' }} />
        {/* Define the main app tabs */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
  );
}


export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    // Wrap the entire app with AuthProvider
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <InitialLayout />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}

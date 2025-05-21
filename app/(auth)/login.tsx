import React, { useState } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Alert, // Keep Alert for critical/unhandled errors if needed, though mostly using inline
    Pressable,
    ActivityIndicator,
    Text, // Import standard Text for button
    SafeAreaView // Good practice for screen roots
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// --- Component ---
export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const styles = useStyles(colorScheme); // Pass scheme to dynamic styles

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const router = useRouter(); // Keep if used for other direct navigation
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // State for error message

  const handleLogin = async () => {
    setError(null); // Clear previous errors
    if (!email.trim() || !password.trim()) {
        setError("Please enter both email and password.");
        return;
    }
    setIsLoading(true);
    try {
      await login(email, password);
      // Navigation is handled by AuthContext listener in _layout.tsx
      console.log("Login attempt successful, waiting for auth state change...");
    } catch (e: any) {
      console.error("Login screen error (raw Firebase error):", e); // Log the raw error for debugging
      // Set a user-friendly error message based on Firebase error codes
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError("Invalid email or password. Please try again.");
      } else if (e.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else if (e.code === 'auth/too-many-requests') {
        setError("Access to this account has been temporarily disabled due to many failed login attempts. You can try again later or reset your password.");
      } else if (e.code === 'auth/user-disabled') {
        setError("This user account has been disabled. Please contact support.");
      }
      else {
        // Default generic message for other Firebase or network errors
        setError('Login failed. An unexpected error occurred. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
            Welcome Back!
        </ThemedText>
        <ThemedText style={styles.subtitle}>
            Please sign in to continue.
        </ThemedText>

        <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={(text) => { setEmail(text); setError(null); }} // Clear error on input change
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon} // Themed placeholder
            textContentType="emailAddress" // Helps with autofill
            autoComplete="email" // For newer RN versions, "email" is preferred
            inputMode="email" // More specific keyboard type
        />

        <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={(text) => { setPassword(text); setError(null); }} // Clear error on input change
            secureTextEntry
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon} // Themed placeholder
            textContentType="password" // Helps with autofill
            autoComplete="password" // For newer RN versions, "password" is preferred
        />

        {/* Display error message */}
        {error && (
            <ThemedText style={styles.errorText}>{error}</ThemedText>
        )}

        <Pressable
            style={({ pressed }) => [
                styles.button,
                isLoading && styles.buttonDisabled, // Style for when loading
                pressed && styles.buttonPressed   // Style for when pressed
            ]}
            onPress={handleLogin}
            disabled={isLoading} // Disable button when loading
            accessibilityRole="button"
            accessibilityLabel="Login"
        >
            {isLoading ? (
            <ActivityIndicator size="small" color={styles.buttonText.color} /> // Use button text color for spinner
            ) : (
            <Text style={styles.buttonText}>Login</Text> // Use standard Text for more control
            )}
        </Pressable>

        <Link href="/(auth)/signup" asChild>
            <Pressable style={styles.signupLinkContainer} disabled={isLoading}>
            <ThemedText style={styles.signupText}>
                Don't have an account?{' '}
                <ThemedText type="link" style={styles.signupLinkText}>
                Sign Up
                </ThemedText>
            </ThemedText>
            </Pressable>
        </Link>
        </ThemedView>
    </SafeAreaView>
  );
}

// --- Dynamic Styles ---
const useStyles = (colorScheme: 'light' | 'dark' | null | undefined) => {
    const currentScheme = colorScheme ?? 'light'; // Default to light if null/undefined
    const themeColors = Colors[currentScheme];

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: themeColors.background, // Background for the whole safe area
        },
        container: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 30,
            // backgroundColor is handled by ThemedView which gets it from context/hook
        },
        title: {
            fontSize: 28, // Adjusted size
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 8,
            color: themeColors.text,
        },
        subtitle: {
            fontSize: 16,
            textAlign: 'center',
            marginBottom: 30, // Space after subtitle
            color: themeColors.icon, // Muted color for subtitle
        },
        input: {
            height: 50,
            borderColor: themeColors.icon + '80', // Lighter border, 80 for ~50% opacity
            borderWidth: 1,
            borderRadius: 10,
            marginBottom: 15,
            paddingHorizontal: 15,
            fontSize: 16,
            color: themeColors.text, // Input text color
            // Optional: Distinct background for inputs if desired
            backgroundColor: currentScheme === 'light' ? '#F5F5F5' : '#2C2C2E',
        },
        errorText: {
            color: currentScheme === 'light' ? '#CC0000' : '#FF6B6B', // Different red for dark/light
            textAlign: 'center',
            marginBottom: 15,
            fontSize: 14,
        },
        button: {
            // Example primary button color (you can define this in Colors.ts)
            backgroundColor: themeColors.tint, // Or a dedicated primary button color
            paddingVertical: 14, // Adjusted padding
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 10,
            marginBottom: 20,
            minHeight: 50,
            shadowColor: '#000', // Basic shadow
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 3,
        },
        buttonPressed: {
            opacity: 0.85, // Slightly more opacity change on press
        },
        buttonDisabled: {
            backgroundColor: themeColors.icon, // Muted color when disabled/loading
        },
        buttonText: {
            // Ensure this color has good contrast with styles.button.backgroundColor
            //color: currentScheme === 'light' ? (Colors.light.tint === '00000' ? Colors.dark.text : Colors.dark.text) : Colors.dark.text, // Smart default for text
            fontSize: 16,
            color: '#000000',
            fontWeight: '600', // Slightly less bold than "bold"
        },
        signupLinkContainer: {
            marginTop: 20, // More space above this link
            paddingVertical: 10, // Make it easier to tap
            alignItems: 'center',
        },
        signupText: {
            fontSize: 14,
            color: themeColors.text,
        },
        signupLinkText: {
            fontWeight: 'bold',
            color: themeColors.tint, // Use theme link color
        }
    });
};
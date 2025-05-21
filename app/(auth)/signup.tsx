import React, { useState } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Alert, // Keep for unhandled errors if needed, but prefer inline
    Pressable,
    ActivityIndicator,
    Text, // For button text
    SafeAreaView, // For root
    ScrollView // To prevent content being hidden by keyboard
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// --- Component ---
export default function SignupScreen() {
  const colorScheme = useColorScheme();
  const styles = useStyles(colorScheme); // Dynamic styles

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signup } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // For inline error messages

  const handleSignup = async () => {
    setError(null); // Clear previous errors

    // Basic client-side validation
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    // Optional: Add password strength validation here (e.g., min length)
    if (password.length < 6) {
        setError('Password should be at least 6 characters long.');
        return;
    }

    setIsLoading(true);
    try {
      await signup(email, password);
      console.log("Signup attempt successful, waiting for auth state change...");
      // Navigation is handled by AuthContext listener
      // No Alert on success, user will be redirected
    } catch (e: any) {
      console.error("Signup screen error (raw Firebase error):", e);
      // Set user-friendly error messages
      if (e.code === 'auth/email-already-in-use') {
        setError('This email address is already in use.');
      } else if (e.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (e.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger one.');
      } else {
        setError('Signup failed. An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.title}>
            Create Account
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Join our community!
          </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={(text) => { setEmail(text); setError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
            textContentType="emailAddress"
            autoComplete="email"
            inputMode="email"
          />

          <TextInput
            style={styles.input}
            placeholder="Password (min. 6 characters)"
            value={password}
            onChangeText={(text) => { setPassword(text); setError(null); }}
            secureTextEntry
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
            textContentType="newPassword" // Helps password managers
            autoComplete="new-password"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
            secureTextEntry
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
            textContentType="newPassword"
          />

          {error && (
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          )}

          <Pressable
            style={({ pressed }) => [
                styles.button,
                isLoading && styles.buttonDisabled,
                pressed && styles.buttonPressed
            ]}
            onPress={handleSignup}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign Up"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={styles.buttonText.color} />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </Pressable>

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.loginLinkContainer} disabled={isLoading}>
              <ThemedText style={styles.loginText}>
                Already have an account?{' '}
                <ThemedText type="link" style={styles.loginLinkText}>
                  Login
                </ThemedText>
              </ThemedText>
            </Pressable>
          </Link>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Dynamic Styles ---
const useStyles = (colorScheme: 'light' | 'dark' | null | undefined) => {
    const currentScheme = colorScheme ?? 'light';
    const themeColors = Colors[currentScheme];

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: themeColors.background,
        },
        scrollContainer: { // For ScrollView to allow centering content
            flexGrow: 1,
            justifyContent: 'center',
        },
        container: {
            // No flex: 1 here as ScrollView's contentContainer handles it
            paddingHorizontal: 30,
            paddingVertical: 20, // Add vertical padding if needed
        },
        title: {
            fontSize: 28,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 8,
            color: themeColors.text,
        },
        subtitle: {
            fontSize: 16,
            textAlign: 'center',
            marginBottom: 30,
            color: themeColors.icon,
        },
        input: {
            height: 50,
            borderColor: themeColors.icon + '80',
            borderWidth: 1,
            borderRadius: 10,
            marginBottom: 15,
            paddingHorizontal: 15,
            fontSize: 16,
            color: themeColors.text,
            backgroundColor: currentScheme === 'light' ? '#F5F5F5' : '#2C2C2E',
        },
        errorText: {
            color: currentScheme === 'light' ? '#CC0000' : '#FF6B6B',
            textAlign: 'center',
            marginBottom: 15,
            fontSize: 14,
        },
        button: {
            backgroundColor: themeColors.tint,
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 10,
            marginBottom: 20,
            minHeight: 50,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 3,
        },
        buttonPressed: {
            opacity: 0.85,
        },
        buttonDisabled: {
            backgroundColor: themeColors.icon,
        },
        buttonText: {
            color: '#000000',            
            fontSize: 16,
            fontWeight: '600',
        },
        loginLinkContainer: {
            marginTop: 20,
            paddingVertical: 10,
            alignItems: 'center',
        },
        loginText: {
            fontSize: 14,
            color: themeColors.text,
        },
        loginLinkText: {
            fontWeight: 'bold',
            color: themeColors.tint,
        }
    });
};
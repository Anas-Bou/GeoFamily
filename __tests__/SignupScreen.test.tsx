// app/(auth)/__tests__/SignupScreen.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignupScreen from '../app/(auth)/signup'; // Adjust path if needed
import { Alert, Pressable } from 'react-native'; // Import Alert and Pressable

// --- Mocks ---
const mockSignup = jest.fn();
const mockPush = jest.fn();

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    signup: mockSignup,
    // Provide default non-authenticated state
    user: null,
    isAuthenticated: false,
    loadingAuth: false,
  }),
}));

// Mock Expo Router (including Link handling 'asChild')
jest.mock('expo-router', () => {
  const React = require('react');
  const Pressable = require('react-native').Pressable;
  return {
    useRouter: () => ({ push: mockPush }),
    Link: ({ href, children, asChild, style, ...rest }: any) => {
      const onPress = () => mockPush(href);
      if (asChild && React.isValidElement(children)) {
        try {
          const childElement = React.Children.only(children) as React.ReactElement<any>;
          const originalOnPress = childElement.props.onPress;
          return React.cloneElement(childElement, {
            ...rest,
            style: [childElement.props.style, style],
            onPress: originalOnPress ? (...args: any[]) => { originalOnPress(...args); onPress(); } : onPress,
          });
        } catch (e) {
          console.error("Link mock 'asChild' error: Children must be a single element.");
          return <Pressable onPress={onPress} style={style} {...rest}>{children}</Pressable>;
        }
      }
      return <Pressable onPress={onPress} style={style} {...rest}>{children}</Pressable>;
    },
  };
});

// --- Test Suite ---
describe('<SignupScreen /> - UC1.2 S\'inscrire', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSignup.mockClear();
    mockPush.mockClear();
    jest.clearAllMocks(); // Clears spies too if any are added globally
  });

  it('devrait afficher les champs email, mot de passe, et confirmation', () => {
    render(<SignupScreen />);
    expect(screen.getByPlaceholderText('Email')).toBeVisible();
    expect(screen.getByPlaceholderText('Password')).toBeVisible();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeVisible();
    expect(screen.getByRole('button', { name: /Sign Up/i })).toBeVisible();
  });

  it('devrait appeler la fonction signup avec les bonnes informations lors de la soumission valide', async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    render(<SignupScreen />);

    // Perform setup outside act
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'newuser@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm Password'), 'password123');

    // Wrap ONLY the action causing potential state updates and async calls
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Sign Up/i }));
      // Directly await the mocked promise IF it's guaranteed to be called.
      // If it might not be called (e.g., validation fails), this will hang.
      // await mockSignup; // Let's avoid awaiting the mock directly for now.
    });

    // Assert AFTER act completes
    // Use waitFor to check the mock, allowing time for async operations within handleSignup
    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
    expect(mockSignup).toHaveBeenCalledWith('newuser@example.com', 'password123');
  });

  it('devrait afficher une alerte si les mots de passe ne correspondent pas', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<SignupScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm Password'), 'passwordMISMATCH');
    fireEvent.press(screen.getByRole('button', { name: /Sign Up/i }));

    expect(mockSignup).not.toHaveBeenCalled(); // Signup function should not be called
    expect(alertSpy).toHaveBeenCalledWith('Signup Failed', 'Passwords do not match.');

    alertSpy.mockRestore(); // Clean up spy
  });

  it('devrait afficher une alerte si un champ est vide', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<SignupScreen />);

    // Leave email empty
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm Password'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: /Sign Up/i }));

    expect(mockSignup).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Signup Failed', 'Please fill in all fields.');

    alertSpy.mockRestore();
  });

   it('devrait afficher une alerte en cas d\'échec de la fonction signup', async () => {
    const errorMessage = 'Email already in use';
    mockSignup.mockRejectedValueOnce(new Error(errorMessage));
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<SignupScreen />);

    // Setup outside act
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'existing@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm Password'), 'password123');

    // Wrap the press and allow rejection to happen
    await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: /Sign Up/i }));
        // Allow the rejection to occur, catch it so test doesn't fail prematurely
        try { await mockSignup; } catch (e) { /* Expected */ }
    });

    // Assert after act, waiting for the mock call
    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith('Signup Failed', expect.stringContaining(errorMessage));
    alertSpy.mockRestore();
   });

   it('devrait afficher "Signing up..." pendant l\'inscription', async () => {
     // *** Enable Fake Timers for this test ***
     jest.useFakeTimers();

     mockSignup.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))); // Increased delay
     render(<SignupScreen />);

     fireEvent.changeText(screen.getByPlaceholderText('Email'), 'wait@test.com');
     fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
     fireEvent.changeText(screen.getByPlaceholderText('Confirm Password'), 'password123');

     // Press button (synchronous state update should happen)
     fireEvent.press(screen.getByRole('button', { name: /Sign Up/i }));

     // Check for loading state immediately
     expect(screen.getByRole('button', { name: /Signing up.../i })).toBeVisible();

     // Use act and advance timers to handle the async mock and state updates
     await act(async () => {
       await jest.advanceTimersByTimeAsync(150); // Advance past the setTimeout delay
     });

     // Check button text reverted
     expect(screen.getByRole('button', { name: /^Sign Up$/i })).toBeVisible();

     // *** Disable Fake Timers ***
     jest.useRealTimers();
   });


  it('devrait naviguer vers Login en cliquant sur le lien', () => {
    render(<SignupScreen />);
    // Find the Pressable rendered by the mocked Link via its text content
    fireEvent.press(screen.getByText(/Already have an account\? Login/i));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });
});
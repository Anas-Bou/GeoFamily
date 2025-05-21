import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/(auth)/login'; // Ajustez le chemin
import { Alert } from 'react-native';
import { Pressable } from 'react-native'; // Import Pressable


// Mocker les dépendances
const mockLogin = jest.fn();
const mockNavigate = jest.fn(); // Si vous utilisez la navigation react-navigation
const mockPush = jest.fn();    // Si vous utilisez expo-router

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    // Simulez d'autres valeurs de contexte si nécessaire
    user: null,
    isAuthenticated: false,
    loadingAuth: false,
  }),
}));


jest.mock('expo-router', () => {
    // --- Use require INSIDE the factory function BODY ---
    const React = require('react');
    const Pressable = require('react-native').Pressable;
  
    // --- RETURN the object containing the mocks ---
    return {
      useRouter: () => ({ push: mockPush }), // Use the mockPush defined outside
      // Define the Link mock implementation HERE
      Link: ({ href, children, asChild, style, ...rest }: any) => {
        const onPress = () => mockPush(href); // This closure still works
  
        if (asChild && React.isValidElement(children)) { // Use required React
          try {
            // Use required React
            const childElement = React.Children.only(children) as React.ReactElement<any>;
            const originalOnPress = childElement.props.onPress;
            // Use required React
            return React.cloneElement(childElement, {
              ...rest,
              style: [childElement.props.style, style],
              onPress: originalOnPress ? (...args: any[]) => { originalOnPress(...args); onPress(); } : onPress,
            });
          } catch (e) {
            console.error("Link mock 'asChild' error: Children must be a single element.");
            // Use required Pressable
            return <Pressable onPress={onPress} style={style} {...rest}>{children}</Pressable>;
          }
        }
        // Use required Pressable
        return <Pressable onPress={onPress} style={style} {...rest}>{children}</Pressable>;
      }, // End Link mock
    }; // --- End of returned object ---
  }); // --- End o


describe('<LoginScreen /> - UC1.1 Se connecter', () => {
  beforeEach(() => {
    // Réinitialiser les mocks avant chaque test
    mockLogin.mockClear();
    mockPush.mockClear();
    // mockNavigate.mockClear();
  });

  it('devrait afficher les champs email et mot de passe', () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText('Email')).toBeVisible();
    expect(screen.getByPlaceholderText('Password')).toBeVisible();
    expect(screen.getByRole('button', { name: /Login/i })).toBeVisible();
  });

  it('devrait appeler la fonction login avec les bonnes informations lors de la soumission', async () => {
    mockLogin.mockResolvedValueOnce(undefined); // Simule une connexion réussie
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: /Login/i }));

    // Vérifie si login a été appelé
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');

    // Optionnel : Vérifier l'état de chargement
    // expect(screen.getByRole('button', { name: /Logging in.../i })).toBeVisible();
    // await waitFor(() => expect(screen.getByRole('button', { name: /Login/i })).toBeVisible());
  });

  it('devrait afficher une alerte en cas d\'échec de connexion', async () => {
    const errorMessage = 'Invalid credentials';
    mockLogin.mockRejectedValueOnce(new Error(errorMessage)); // Simule un échec
    const alertSpy = jest.spyOn(Alert, 'alert'); // Espionne Alert.alert
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'wrong@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(screen.getByRole('button', { name: /Login/i }));

    // Attendre que la promesse rejetée soit traitée
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());

    // Vérifier si Alert.alert a été appelé
    expect(alertSpy).toHaveBeenCalledWith('Login Failed', expect.stringContaining(errorMessage));
    alertSpy.mockRestore(); // Nettoyer l'espion
  });

  it('devrait naviguer vers Signup en cliquant sur le lien', () => {
    render(<LoginScreen />);
    // Target the Pressable component wrapping the Text via the Text itself
    fireEvent.press(screen.getByText(/Don't have an account\? Sign Up/i));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup'); // Check the path argument
  });
});
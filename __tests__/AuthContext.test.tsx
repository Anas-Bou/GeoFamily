// src/context/__tests__/AuthContext.test.tsx

import React, { ReactNode } from 'react';
import { renderHook, act, waitFor, render, screen } from '@testing-library/react-native';
import { Text, View, Pressable } from 'react-native'; // Import Pressable for Link mock
import { AuthProvider, useAuth, UserProfile } from '../context/AuthContext';
import { User } from 'firebase/auth';
import { Timestamp, GeoPoint, FieldValue } from 'firebase/firestore'; // Import used types
// --- Mock Firebase Modules ---

// Keep track of callbacks
let authStateCallback: ((user: User | null) => void) | null = null;
const profileListeners: { [key: string]: (snapshot: any) => void } = {};

// Mock functions
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockSetDoc = jest.fn();
const mockGetDoc = jest.fn(); 

jest.mock('firebase/auth', () => ({
    getAuth: jest.fn(() => ({})),
    onAuthStateChanged: jest.fn((authInstance, callback) => {
      console.log("Test: onAuthStateChanged listener attached.");
      authStateCallback = callback;
      return jest.fn(() => { console.log("Test: onAuthStateChanged listener cleaned up."); authStateCallback = null; });
    }),
    signInWithEmailAndPassword: (...args: any[]) => mockSignIn(...args),
    createUserWithEmailAndPassword: (...args: any[]) => mockSignUp(...args),
    signOut: (...args: any[]) => mockSignOut(...args),
}));

jest.mock('firebase/firestore', () => {
    const profileListeners: { [key: string]: (snapshot: any) => void } = {};
    return {
        getFirestore: jest.fn(() => ({})),
        doc: jest.fn((firestoreInstance, path, id) => ({ id: id, path: `${path}/${id}` })),
        setDoc: (...args: any[]) => mockSetDoc(...args),
        serverTimestamp: jest.fn(() => 'mock_server_timestamp'),
        getDoc: (...args: any[]) => mockGetDoc(...args),
        Timestamp: {
            now: jest.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
            fromDate: jest.fn((date: Date) => ({ toDate: () => date, toMillis: () => date.getTime() })),
        },
        GeoPoint: jest.fn((lat, lon) => ({ latitude: lat, longitude: lon })),
        onSnapshot: jest.fn((docRef: { id: string }, callback: (snapshot: any) => void) => {
            console.log(`Test Mock onSnapshot: Storing listener for ${docRef.id}`);
            profileListeners[docRef.id] = callback;
            return jest.fn(() => { console.log(`Test Mock onSnapshot: Unsubscribing listener for ${docRef.id}`); delete profileListeners[docRef.id]; });
        }),
        collection: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(),
        FieldValue: { delete: jest.fn(() => 'mock_field_value_delete') },
         __triggerProfileSnapshot: (userId: string, snapshotData: any) => {
              const callback = profileListeners[userId];
              if (callback) { console.log(`Test __triggerProfileSnapshot: Triggering for ${userId}`); callback(snapshotData); }
              else { console.warn(`Test __triggerProfileSnapshot: No listener found for ${userId}`); }
         },
         __clearProfileListeners: () => { Object.keys(profileListeners).forEach(key => delete profileListeners[key]); }
    };
});

// Mock the config (needed as context imports it)
jest.mock('@/config/firebaseConfig', () => ({
  auth: {},
  firestore: {},
}));

const mockPush = jest.fn();

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

// --- Helper Test Component ---
const TestConsumer = () => {
    const { user, currentUserProfile, isAuthenticated, loadingAuth } = useAuth();
    console.log("TestConsumer Render - User UID:", user?.uid, "Loading:", loadingAuth, "Profile ID:", currentUserProfile?.id); // Add log
    return (
      <View>
        <Text testID="user-uid">{user?.uid ?? 'null'}</Text>
        <Text testID="profile-id">{currentUserProfile?.id ?? 'null'}</Text>
        <Text testID="profile-name">{currentUserProfile?.name ?? 'null'}</Text>
        <Text testID="isAuthenticated-value">{String(isAuthenticated)}</Text>
        <Text testID="loadingAuth-value">{String(loadingAuth)}</Text>
      </View>
    );
  };

// Helper to render with Provider
const renderWithAuthProvider = (ui: ReactNode = <TestConsumer />) => {
  return render(<AuthProvider>{ui}</AuthProvider>);
};

// Helper to manually trigger profile snapshot updates
const triggerProfileSnapshot = (userId: string, data: Partial<UserProfile> | null) => {
    const firestoreMock = require('firebase/firestore'); // Get the mocked module
    firestoreMock.__triggerProfileSnapshot(userId, {
        exists: () => data !== null,
        id: userId,
        data: () => data, // Pass the data object directly
    });
}

// --- Tests ---
describe('<AuthProvider />', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Clear listeners stored in the mock's closure
    const firestoreMock = require('firebase/firestore');
    firestoreMock.__clearProfileListeners();
    authStateCallback = null; // Reset captured auth callback
  });

  it('should update state and load profile when auth state changes to logged in', async () => {
    // Use renderHook to directly test the hook's return value
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    const mockUser = { uid: 'user1', email: 'user1@test.com' } as User;
    const mockProfileData: Partial<UserProfile> = { name: 'Test User 1', email: 'user1@test.com', familyId: null, role: null, avatarUrl: undefined };
    // Act 1: Simulate Auth Login event
    act(() => { if (authStateCallback) authStateCallback(mockUser); });

    // Assert/Wait: User object should be updated in the hook's state
    await waitFor(() => expect(result.current.user?.uid).toBe('user1'));
    // Now loading should be true because profile listener started

    // Act 2: Simulate Profile Snapshot arriving
    await act(async () => {
        triggerProfileSnapshot('user1', mockProfileData);
    });

    // Assert/Wait: Wait for loading to finish and check final state
    await waitFor(() => expect(result.current.loadingAuth).toBe(false));
    expect(result.current.currentUserProfile?.id).toBe('user1');
    expect(result.current.currentUserProfile?.name).toBe('Test User 1');
    expect(result.current.isAuthenticated).toBe(true); // Check isAuthenticated as well
  });

  it('should handle profile not found for logged in user', async () => {
      renderWithAuthProvider();
      const mockUser = { uid: 'user-no-profile', email: 'no@profile.com' } as User;

      // Act 1: Simulate Auth Login
      act(() => { if (authStateCallback) authStateCallback(mockUser); });

      // Act 2: Simulate Profile Snapshot not existing
      await act(async () => {
         triggerProfileSnapshot('user-no-profile', null); // Pass null to indicate not found
      });

      // Assert: Wait for loading to finish and check state
      await waitFor(() => expect(screen.getByTestId('loadingAuth-value').props.children).toBe('false'));
      expect(screen.getByTestId('user-uid').props.children).toBe('user-no-profile');
      expect(screen.getByTestId('profile-id').props.children).toBe('null'); // Profile remains null
      expect(screen.getByTestId('isAuthenticated-value').props.children).toBe('true'); // Still authenticated
    });


  describe('login function', () => {
    it('should call signInWithEmailAndPassword and update state on success', async () => {
      // Use renderHook to test the hook's functions directly
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      const mockUser = { uid: 'logged-in-user', email: 'login@test.com' } as User;
      const mockProfileData: Partial<UserProfile> = { name: 'Logged In User'};
      mockSignIn.mockResolvedValueOnce({ user: mockUser });

      // Act 1: Call login
      await act(async () => {
        await result.current.login('login@test.com', 'password');
      });
      expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), 'login@test.com', 'password');

      // Act 2: Simulate Auth Change
      act(() => { if (authStateCallback) authStateCallback(mockUser); });

      // Act 3: Simulate Profile Load
      await act(async () => {
          triggerProfileSnapshot('logged-in-user', mockProfileData);
      });

      // Assert: Wait for profile update and check final state via hook result
      await waitFor(() => {
          expect(result.current.currentUserProfile?.id).toBe('logged-in-user');
      });
      expect(result.current.loadingAuth).toBe(false);
      expect(result.current.user?.uid).toBe('logged-in-user');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.currentUserProfile?.name).toBe('Logged In User');
    });

    it('should throw error on failed login', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      const error = new Error('Login failed');
      mockSignIn.mockRejectedValueOnce(error);

      // Expect the promise returned by login to reject
      await expect(result.current.login('bad@test.com', 'badpass'))
        .rejects.toThrow('Login failed');

      expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), 'bad@test.com', 'badpass');
      // Ensure user state did not change (it should still be null)
       // Need to wait briefly for potential state updates before checking
       await act(async () => {}); // Allow any microtasks to flush
      expect(result.current.user).toBeNull();
      expect(result.current.currentUserProfile).toBeNull();
    });
  });

  describe('signup function', () => {
    it('should call createUser, setDoc and update state on success', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      const mockNewUser = { uid: 'new-user-id', email: 'new@test.com' } as User;
      const mockProfileData: Partial<UserProfile> = { name: 'new', email: 'new@test.com', familyId: null, role: null };
      mockSignUp.mockResolvedValueOnce({ user: mockNewUser });
      mockSetDoc.mockResolvedValueOnce(undefined);

      // Act 1: Call signup
      await act(async () => {
        await result.current.signup('new@test.com', 'newpass');
      });

      // Assert: Check mock calls
      expect(mockSignUp).toHaveBeenCalledWith(expect.anything(), 'new@test.com', 'newpass');
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-user-id' }), // Check docRef
        expect.objectContaining({ // Check data
          name: 'new',
          email: 'new@test.com',
          familyId: null,
          role: null,
          fcmToken: undefined,
          createdAt: expect.anything(),
        })
      );

      // Act 2: Simulate Auth Change
      act(() => { if (authStateCallback) authStateCallback(mockNewUser); });

      // Act 3: Simulate Profile Load (using data that would be in Firestore)
      await act(async () => {
          triggerProfileSnapshot('new-user-id', mockProfileData);
      });

      // Assert: Wait for profile and check final state
      await waitFor(() => {
        expect(result.current.currentUserProfile?.id).toBe('new-user-id');
      });
      expect(result.current.loadingAuth).toBe(false);
      expect(result.current.user?.uid).toBe('new-user-id');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.currentUserProfile?.name).toBe('new');
    });

    it('should throw error on failed signup', async () => {
       const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
       const error = new Error('Signup failed');
       mockSignUp.mockRejectedValueOnce(error);

       await expect(result.current.signup('exists@test.com', 'password'))
         .rejects.toThrow('Signup failed');

       expect(mockSignUp).toHaveBeenCalledWith(expect.anything(), 'exists@test.com', 'password');
       expect(mockSetDoc).not.toHaveBeenCalled();
        await act(async () => {});
       expect(result.current.user).toBeNull();
    });
  });

  describe('logout function', () => {
    it('should call signOut and clear state', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
        const mockUser = { uid: 'user-to-logout', email: 'logout@test.com' } as User;
        mockSignOut.mockResolvedValueOnce(undefined);

        // 1. Simulate initial logged-in state
        act(() => { if (authStateCallback) authStateCallback(mockUser); });
        await act(async () => { triggerProfileSnapshot('user-to-logout', { name: 'Logout User'}); });
        await waitFor(() => expect(result.current.isAuthenticated).toBe(true)); // Verify logged in

        // 2. Call logout
        await act(async () => { await result.current.logout(); });
        expect(mockSignOut).toHaveBeenCalledTimes(1);

        // 3. Simulate onAuthStateChanged firing with null
        act(() => { if (authStateCallback) authStateCallback(null); });

        // 4. Wait for state to clear (loading should be false now)
        await waitFor(() => expect(result.current.loadingAuth).toBe(false));

        // 5. Verify state is cleared
        expect(result.current.user).toBeNull();
        expect(result.current.currentUserProfile).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
      });
   });

}); // End describe <AuthProvider />
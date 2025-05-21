import React, { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react'; // Added useRef
import { auth, firestore } from '@/config/firebaseConfig'; // Removed database if not used here
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
// Import Firestore functions needed: doc, setDoc, serverTimestamp, onSnapshot, Unsubscribe
import { doc, setDoc, serverTimestamp, onSnapshot, Unsubscribe } from 'firebase/firestore';

// --- Define UserProfile Type ---
// It's best to define this in a shared types file, but for now, we define it here.
// Ensure it matches the structure in Firestore AND includes fields needed by the app (like role, familyId)
// Using 'FamilyMember' from index.tsx might be okay if it contains these fields, but defining specifically can be clearer.
export interface UserProfile {
    id: string; // User UID (same as auth user.uid)
    name: string;
    email: string;
    familyId: string | null;
    role: string | null;
    avatarUrl?: string;     // Use optional (?) => type becomes string | undefined
    createdAt?: any;        // Consider using Timestamp from 'firebase/firestore' if needed
    // --- CHANGE THIS ---
    fcmToken?: string; 
    settings?: { // Make settings object optional initially
      shareLocation?: boolean;
      batteryAlerts?: boolean;
      // Add other settings later if needed
  };
}

// --- Define Context Type ---
interface AuthContextType {
  user: User | null; // Firebase Auth user object
  currentUserProfile: UserProfile | null; // <<< ADDED PROFILE STATE TO TYPE
  isAuthenticated: boolean;
  loadingAuth: boolean; // Represents loading of BOTH auth state and initial profile
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

// --- Create Context ---
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Auth Provider Component ---
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null); // <<< ADDED PROFILE STATE
  const [loadingAuth, setLoadingAuth] = useState(true); // Represents combined loading
  const profileListener = useRef<Unsubscribe | null>(null); // Ref for profile listener cleanup

  // Listener for Firebase Auth State Changes
  useEffect(() => {
    console.log("Auth Listener Setup");
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      console.log("Auth state changed, user object:", currentUser?.uid);
      setUser(currentUser); // Update the auth user state
      // Don't setLoadingAuth(false) here, wait for profile listener below
      if (!currentUser) {
        // If user logs out, immediately clear profile and stop loading
        setCurrentUserProfile(null);
        setLoadingAuth(false);
      }
    });
    // Cleanup auth listener on component unmount
    return () => {
       console.log("Auth Listener Cleanup");
       unsubscribeAuth();
    };
  }, []); // Run only once when the provider mounts


  // Listener for User Profile Document in Firestore
  useEffect(() => {
    // Function to cleanup the profile listener
    const cleanupProfileListener = () => {
        if (profileListener.current) {
            console.log("Cleaning up previous profile listener.");
            profileListener.current();
            profileListener.current = null;
        }
    };

    // Reset profile and start loading ONLY when the user object changes
    cleanupProfileListener(); // Cleanup any existing listener first
    setCurrentUserProfile(null); // Clear old profile data

    if (user) {
      console.log("Profile Listener Setup: User detected, setting up listener for", user.uid);
      setLoadingAuth(true); // Start loading profile data
      const userDocRef = doc(firestore, 'users', user.uid);

      profileListener.current = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          console.log("Profile Listener: Snapshot received (Exists).");
          // Construct profile object, ensure 'id' is included
          const profileData = { id: docSnap.id, ...docSnap.data() } as UserProfile;
          setCurrentUserProfile(profileData);
        } else {
          console.warn("Profile Listener: User profile document NOT FOUND for UID:", user.uid);
          setCurrentUserProfile(null); // Set profile to null if doc doesn't exist
        }
        setLoadingAuth(false); // Stop loading after profile fetch attempt (success or not found)
      }, (error) => {
        console.error("Profile Listener: Error fetching user profile:", error);
        setCurrentUserProfile(null); // Clear profile on error
        setLoadingAuth(false); // Stop loading on error
      });

    } else {
      // No user logged in, ensure loading is false and listener is cleaned up (already done above)
      console.log("Profile Listener Setup: No user, skipping listener setup.");
      setLoadingAuth(false);
    }

    // Return the cleanup function for this effect
    return cleanupProfileListener;

  }, [user]); // This effect depends ONLY on the auth `user` object


  // --- Auth Functions (Login, Signup, Logout) ---
  const login = async (email: string, pass: string) => {
     try {
        await signInWithEmailAndPassword(auth, email, pass);
        console.log("Login successful for:", email);
        // Profile listener will automatically fetch data on user change
     } catch (error: any) {
        console.error("Login error:", error.message);
        throw error; // Re-throw for UI handling
     }
  };

  const signup = async (email: string, pass: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;
      console.log("Signup auth successful for:", newUser.email);

      // Create Firestore user document
      const userDocData: Omit<UserProfile, 'id' | 'createdAt'> = { // Use Omit to exclude generated fields
        name: email.split('@')[0] || 'New User',
        email: newUser.email!, // Use non-null assertion as email exists on signup
        familyId: null,
        role: null,
        //avatarUrl: null,
        //fcmToken: undefined, // Initialize fcmToken field if used
      };
      await setDoc(doc(firestore, "users", newUser.uid), {
          ...userDocData,
          createdAt: serverTimestamp() // Add timestamp on creation
      });
      console.log("Firestore user document created for:", newUser.email);
      // Profile listener will pick up this new document

    } catch (error: any) {
      console.error("Signup error:", error.message);
      throw error;
    }
  };

  const logout = async () => {
      try {
         await signOut(auth);
         console.log("Logout successful");
         // Setting user to null via onAuthStateChanged triggers profile cleanup
      } catch (error: any) {
         console.error("Logout error:", error.message);
         throw error;
      }
  };

  // Determine authentication status (user must exist AND profile must have loaded, even if null)
  const isAuthenticated = !!user; // Simpler: Just check if firebase auth user exists
  // Or stricter: const isAuthenticated = !!user && !!currentUserProfile;

  // Render children only after initial auth check AND profile check is complete
  if (loadingAuth) {
     return null; // Or your global loading screen component
  }

  // Provide user AND profile in the context value
  return (
    <AuthContext.Provider value={{ user, currentUserProfile, isAuthenticated, loadingAuth, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Custom Hook: useAuth ---
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context; // Now returns { user, currentUserProfile, isAuthenticated, ... }
};
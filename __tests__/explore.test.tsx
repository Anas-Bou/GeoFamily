// src/app/(tabs)/__tests__/explore.test.tsx

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import FamilyScreen from '../app/(tabs)/explore';
import { FamilyMember } from '../app/(tabs)/index'; // Adjust path
// Removed UserProfile import from context as component doesn't need it directly for fetching
import { Timestamp, GeoPoint } from 'firebase/firestore';

// --- Mock Data ---
const mockUser = { uid: 'user1' };
// Provide the full profile data needed by the component via the mocked useAuth
const mockAuthContextProfile: any = { // Use 'any' for simplicity in mock, or import UserProfile type
    id: 'user1', name: 'User One', email: 'user1@test.com',
    familyId: 'fam1', role: 'admin', avatarUrl: undefined // Use undefined for optional string
};
const mockMembersSnapshotDocs = [
    { id: 'user1', data: () => ({ name: 'User One', email: 'user1@test.com', familyId: 'fam1', role: 'admin', avatarUrl: null }) },
    { id: 'user2', data: () => ({ name: 'User Two', email: 'user2@test.com', familyId: 'fam1', role: 'member', avatarUrl: 'http://example.com/avatar.png' }) },
    { id: 'user3', data: () => ({ name: 'User Three', email: 'user3@test.com', familyId: 'fam1', role: 'member', avatarUrl: null }) },
];
const mockRtdbData: { [key: string]: any } = {
    'user1': { batteryLevel: 90, currentLocation: { latitude: 10.01, longitude: 10.01 } },
    'user2': { batteryLevel: 75, currentLocation: { latitude: 10.02, longitude: 10.02 } },
    'user3': { currentLocation: { latitude: 10.03, longitude: 10.03 } }, // User 3 has location but no battery
};

// --- Mocks ---

// Mock AuthContext - Provide profile data here
jest.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
        currentUserProfile: mockAuthContextProfile, // Provide the needed profile
        // Mock other auth functions if needed by explore.tsx (likely not)
        // logout: jest.fn(),
    }),
}));

// Mock Firestore (onSnapshot for members query)
const mockFirestoreOnSnapshot = jest.fn();
// Removed GetDoc/GetDocs mocks as they aren't directly called by simplified component

jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    doc: jest.fn((_, path, id) => ({ id: id, path: `${path}/${id}` })),
    collection: jest.fn((_, path) => ({ path })),
    query: jest.fn((collRef, ...constraints) => ({ _query: { path: collRef.path, constraints }})),
    where: jest.fn(),
    orderBy: jest.fn(), // Mock if used
    limit: jest.fn(),   // Mock if used
    onSnapshot: (...args: any[]) => mockFirestoreOnSnapshot(...args), // Use top-level mock
    // Removed getDoc/getDocs mocks
    // Timestamp: { /* ... */ },
    // GeoPoint: jest.fn(),
}));

// Mock RTDB (ref and onValue)
let outerRtdbListenersMap = new Map<string, Function>();
jest.mock('firebase/database', () => {
    const rtdbListenersMap_internal = new Map<string, Function>();
    outerRtdbListenersMap = rtdbListenersMap_internal;
    return {
        getDatabase: jest.fn(),
        ref: (db: any, path: string) => ({ path }), // Return object with path
        onValue: (refMock: { path: string }, callback: Function) => {
            console.log(`Test Mock RTDB onValue: Attaching listener for path: ${refMock.path}`);
            rtdbListenersMap_internal.set(refMock.path, callback);
            return () => { rtdbListenersMap_internal.delete(refMock.path); };
        },
        __triggerRtdbUpdate: (path: string, snapshotData: any) => { /* ... */ },
        __clearRtdbListeners: () => { rtdbListenersMap_internal.clear(); }
    };
});

// Mock config
jest.mock('@/config/firebaseConfig', () => ({ auth: {}, firestore: {}, database: {} }));

// Helper trigger
const triggerRtdbLiveData = (userId: string, liveData: any) => {
     const databaseMock = require('firebase/database');
     const path = `/liveData/${userId}`;
     databaseMock.__triggerRtdbUpdate(path, { val: () => liveData });
}

// --- Test Suite ---
describe('<FamilyScreen />', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        const databaseMock = require('firebase/database');
        databaseMock.__clearRtdbListeners();

        // Mock the members query listener setup (onSnapshot)
        mockFirestoreOnSnapshot.mockImplementation((queryDesc: any, callback: (snap: any) => void) => {
             const collectionPath = queryDesc?._query?.path?.segments?.[0];
             if (collectionPath === 'users') { // Check it's the members query
                 const mockSnapshot = {
                     empty: false, docs: mockMembersSnapshotDocs,
                     forEach: function(cb: any) { this.docs.forEach(cb); }
                 };
                 // Simulate async data load
                 setTimeout(() => callback(mockSnapshot), 0);
             } else {
                 // Default empty snapshot for other queries if any
                 setTimeout(() => callback({ empty: true, docs: [], forEach: () => {} }), 0);
             }
             return jest.fn(); // Return unsubscribe
        });
    });

    it('devrait afficher les membres avec leur niveau de batterie et avatar/placeholder', async () => {
        render(<FamilyScreen />);

        // Wait for initial members (from Firestore mock)
        expect(await screen.findByText('User One (You)')).toBeVisible();
        expect(await screen.findByText('User Two')).toBeVisible();
        expect(await screen.findByText('User Three')).toBeVisible();

        // Simulate RTDB updates AFTER initial render
        act(() => {
            triggerRtdbLiveData(mockUser.uid, mockRtdbData[mockUser.uid]);
            triggerRtdbLiveData('user2', mockRtdbData['user2']);
            triggerRtdbLiveData('user3', mockRtdbData['user3']); // User 3 has location, no battery
        });

        // Assertions - wait for RTDB data
        expect(await screen.findByText('🔋 90%')).toBeVisible(); // User One
        expect(await screen.findByText('🔋 75%')).toBeVisible(); // User Two
        expect(await screen.findByText('🔋 N/A')).toBeVisible(); // User Three

        // Add testIDs for avatar/placeholder checks
    });

     it('devrait afficher "No other members found" si seulement soi-même est retourné', async () => {
         // Override Firestore mock for THIS test only
         mockFirestoreOnSnapshot.mockImplementationOnce((queryDesc: any, callback: (snap: any) => void) => {
             if (queryDesc?._query?.path?.segments?.[0] === 'users') {
                 const mockSnapshot = { empty: false, docs: [mockMembersSnapshotDocs[0]], forEach: function(cb: any) { this.docs.forEach(cb); } };
                 callback(mockSnapshot);
             } else { callback({ empty: true, docs: [], forEach: () => {} }); }
             return jest.fn();
         });

         render(<FamilyScreen />);

         // Simulate RTDB update only for self
         act(() => { triggerRtdbLiveData(mockUser.uid, mockRtdbData[mockUser.uid]); });

         // Check self is rendered
         expect(await screen.findByText('User One (You)')).toBeVisible();
         expect(await screen.findByText('🔋 90%')).toBeVisible();

         // Check other members are NOT rendered
         expect(screen.queryByText('User Two')).toBeNull();
         expect(screen.queryByText('User Three')).toBeNull();

         // Check for empty message
         expect(await screen.findByText(/No other members found/i)).toBeVisible();
     });

    // Add tests for Join/Create buttons if explore.tsx still handles that
    // Add test for Add Geofence button visibility based on isAdmin

});
// src/app/(tabs)/explore.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet, View, Text, FlatList, Image, SafeAreaView, ActivityIndicator,
    Alert, Button, TextInput, Keyboard,
    TouchableOpacity // Added TouchableOpacity for copy action
} from 'react-native';
import * as Clipboard from 'expo-clipboard'; // Import Clipboard
import { IconSymbol } from '@/components/ui/IconSymbol'; // Optional: for a copy icon

// Firebase Imports
import { database, firestore } from '@/config/firebaseConfig';
import { ref, onValue, Unsubscribe as RTDBUnsubscribe } from 'firebase/database';
import {
    collection, query, where, onSnapshot, doc, getDoc,
    Unsubscribe as FirestoreUnsubscribe, runTransaction, serverTimestamp,
    writeBatch, getDocs, limit
} from 'firebase/firestore';

// Import the updated FamilyMember type (adjust path if needed)
import { FamilyMember } from './index';
// Import components and hooks (adjust paths if needed)
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
// Import utility functions (ensure path is correct)
import { generateInviteCode, isInviteCodeUnique } from '@/utils/helpers';

// --- Type for Family Details ---
interface FamilyDetails {
    id: string;
    familyName: string;
    inviteCode: string;
    adminId?: string;
}

// --- Type for Action View State ---
type ActionView = 'options' | 'join' | 'loading';

// --- Component ---
export default function FamilyScreen() {
    const colorScheme = useColorScheme();
    const styles = createStyles(colorScheme);
    const { user } = useAuth();

    // --- State ---
    const [familyMembersMap, setFamilyMembersMap] = useState<Map<string, FamilyMember>>(new Map());
    const [currentUserProfile, setCurrentUserProfile] = useState<FamilyMember | null>(null);
    const [familyInfo, setFamilyInfo] = useState<FamilyDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [actionView, setActionView] = useState<ActionView>('options');
    const [familyCodeInput, setFamilyCodeInput] = useState('');

    // --- Refs for Listeners ---
    const firestoreListener = useRef<FirestoreUnsubscribe | null>(null); // For family members list
    const familyDocListener = useRef<FirestoreUnsubscribe | null>(null); // For the family document itself
    const rtdbListeners = useRef<Map<string, RTDBUnsubscribe>>(new Map()); // For member battery levels
    const profileListener = useRef<FirestoreUnsubscribe | null>(null); // For the current user's profile

    // --- Helper Function to Update Member State ---
    const updateMemberInState = useCallback((memberId: string, updateFn: (member: FamilyMember | undefined) => Partial<FamilyMember>) => {
        setFamilyMembersMap(prevMap => {
            const existingMember = prevMap.get(memberId);
            const updates = updateFn(existingMember);
            // Only update if member exists in map OR if adding a new member with profile data (name exists)
            if (existingMember || updates.name) {
                const newMap = new Map(prevMap);
                // Spread existing data first, then updates, ensuring required fields like id and name are preserved
                const updatedMember = { ...(existingMember || {}), id: memberId, ...updates } as FamilyMember;
                newMap.set(memberId, updatedMember);
                return newMap;
            }
            return prevMap; // No change if trying to partially update a non-existent member
        });
    }, []);

    // --- Effect to Fetch User Profile and Determine Family Status ---
    useEffect(() => {
        // Cleanup function defined first to ensure it's available in all exit paths
        const cleanupListeners = () => {
            console.log("Explore Effect Cleanup: Cleaning all listeners.");
            profileListener.current?.();
            profileListener.current = null;
            familyDocListener.current?.();
            familyDocListener.current = null;
            firestoreListener.current?.();
            firestoreListener.current = null;
            rtdbListeners.current.forEach(unsubscribe => unsubscribe());
            rtdbListeners.current.clear();
        };

        if (!user) {
            console.log("Explore Effect: No user, resetting state and cleaning listeners.");
            setIsLoading(false);
            setCurrentUserProfile(null);
            setFamilyInfo(null);
            setFamilyMembersMap(new Map());
            cleanupListeners(); // Ensure cleanup happens on logout
            return;
        }

        console.log("Explore Effect: User found, setting up profile listener for", user.uid);
        setIsLoading(true);
        setActionView('options'); // Reset view for non-family users

        // Listen to the current user's profile document
        const userDocRef = doc(firestore, 'users', user.uid);
        profileListener.current = onSnapshot(userDocRef, (userDocSnap) => {
            console.log("Explore Profile Snapshot Received:", userDocSnap.id, "Exists:", userDocSnap.exists());

            // --- Cleanup previous family-related listeners before processing new profile data ---
            familyDocListener.current?.();
            firestoreListener.current?.();
            rtdbListeners.current.forEach(unsub => unsub());
            rtdbListeners.current.clear();
            setFamilyMembersMap(new Map()); // Clear members map (will re-add self below)
            setFamilyInfo(null); // Clear family info

            if (!userDocSnap.exists()) {
                console.error("Explore Profile Snapshot: User document not found!");
                setIsLoading(false);
                setCurrentUserProfile(null);
                return; // Stop processing if profile doesn't exist
            }

            // Process existing profile data
            const profileData = { id: userDocSnap.id, ...userDocSnap.data() } as FamilyMember;
            setCurrentUserProfile(profileData);
            updateMemberInState(user.uid, () => profileData); // Add/update self in the map

            const currentFamilyId = profileData.familyId;
            const hasFamily = !!currentFamilyId;

            if (hasFamily) {
                console.log("Explore Profile Snapshot: User HAS familyId", currentFamilyId);
                // User is in a family: Setup listeners for family details and members
                // Listeners will handle setting isLoading to false
                setupFamilyDetailsListener(currentFamilyId!);
                setupFamilyListeners(currentFamilyId!);
            } else {
                console.log("Explore Profile Snapshot: User does NOT have familyId.");
                // User is not in a family
                setIsLoading(false); // Stop loading, UI will show join/create options
            }

        }, (error) => {
            console.error("Explore Profile Snapshot Error:", error);
            Alert.alert("Error", "Could not load your profile data.");
            setIsLoading(false);
            setCurrentUserProfile(null);
            setFamilyInfo(null);
            cleanupListeners(); // Cleanup listeners on profile error
            setFamilyMembersMap(new Map());
        });

        // Return the main cleanup function for the effect
        return cleanupListeners;

    }, [user, updateMemberInState]); // Dependency array

    // --- Function to Setup Listener for Family Document Details ---
    const setupFamilyDetailsListener = (familyId: string) => {
        console.log("Explore: Setting up listener for family details doc:", familyId);
        if (familyDocListener.current) {
            console.warn("Explore: Family details listener already exists, skipping setup.");
            return; // Avoid setting up multiple listeners if called rapidly
        }
        const familyDocRef = doc(firestore, 'families', familyId);
        familyDocListener.current = onSnapshot(familyDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFamilyInfo({
                    id: docSnap.id,
                    familyName: data.familyName || 'Unnamed Family',
                    inviteCode: data.inviteCode || 'N/A',
                    adminId: data.adminId,
                });
                console.log("Explore: Family details loaded/updated:", data.familyName);
            } else {
                console.warn("Explore: Current family document (id:", familyId, ") not found!");
                setFamilyInfo(null);
                // Consider implications: maybe user's familyId is stale?
            }
        }, (error) => {
            console.error("Explore: Error fetching family details:", error);
            setFamilyInfo(null);
            // Possibly alert user
        });
    };

    // --- Function to Setup Family Member Profiles & Battery Listeners ---
    const setupFamilyListeners = (familyId: string) => {
        if (!user) return; // Guard against race condition
        if (firestoreListener.current) {
            console.warn("Explore: Family members listener already exists, skipping setup.");
            return; // Avoid multiple listeners
        }

        console.log("Explore: Setting up Firestore members listener for family:", familyId);
        const membersQuery = query(collection(firestore, 'users'), where("familyId", "==", familyId));
        firestoreListener.current = onSnapshot(membersQuery, (querySnapshot) => {
            console.log(`Explore: Firestore members snapshot received (${querySnapshot.size} members).`);
            const currentMemberIds = new Set<string>();
            const memberProfilesFound = new Map<string, FamilyMember>(); // Store profiles found in *this* snapshot

            // Process profiles found in this snapshot
            querySnapshot.forEach((memberDoc) => {
                const memberProfile = { id: memberDoc.id, ...memberDoc.data() } as FamilyMember;
                memberProfilesFound.set(memberDoc.id, memberProfile);
                currentMemberIds.add(memberDoc.id);
                // Update state immediately with profile data, keeping existing live data
                updateMemberInState(memberDoc.id, (existing) => ({
                    ...memberProfile,
                    batteryLevel: existing?.batteryLevel,
                }));
            });

            // Cleanup: Remove members from map state & RTDB listeners if they are no longer in the snapshot
            setFamilyMembersMap(prevMap => {
                const newMap = new Map(prevMap);
                let mapChanged = false;
                prevMap.forEach((_, memberId) => {
                    // Don't remove self based on this query (profile listener handles self)
                    // Only remove others who are not in the latest snapshot
                    if (memberId !== user.uid && !memberProfilesFound.has(memberId)) {
                        newMap.delete(memberId);
                        mapChanged = true;
                        // Clean up RTDB listener for the removed member
                        const unsub = rtdbListeners.current.get(memberId);
                        if (unsub) {
                            unsub();
                            rtdbListeners.current.delete(memberId);
                            console.log(`Explore: Removed RTDB listener for removed member: ${memberId}`);
                        }
                    }
                });
                return mapChanged ? newMap : prevMap;
            });

            // Setup RTDB Listeners for Battery for current members
            currentMemberIds.forEach(memberId => {
                if (!rtdbListeners.current.has(memberId)) {
                    console.log(`Explore: Adding RTDB listener for member battery: ${memberId}`);
                    const batteryRef = ref(database, `liveData/${memberId}/batteryLevel`);
                    const unsubscribeRtdb = onValue(batteryRef, (snapshot) => {
                        const batteryLevel = snapshot.val() as number | null;
                        console.log(`Explore: RTDB battery update for ${memberId}: ${batteryLevel}`);
                        // Update only batteryLevel in the state map for this member
                        updateMemberInState(memberId, () => ({ batteryLevel: batteryLevel ?? undefined }));
                    }, (error) => {
                        console.error(`Explore: Error fetching RTDB battery for ${memberId}:`, error);
                        // Optionally remove listener on persistent error?
                    });
                    rtdbListeners.current.set(memberId, unsubscribeRtdb);
                }
            });

            // If we are here, means listeners are set up or updated
            setIsLoading(false);

        }, (error) => {
            console.error("Explore: Error fetching family member profiles: ", error);
            Alert.alert("Error", "Could not load family member data.");
            setIsLoading(false); // Stop loading on error
        });
    };


    // --- Action Handlers ---

    const handleCreateFamily = async () => {
        console.log("handleCreateFamily: Function called."); // <-- DEBUG LOG
        if (!user || !currentUserProfile) {
            console.log("handleCreateFamily: Exiting - No user or profile."); // <-- DEBUG LOG
            Alert.alert("Error", "User profile not loaded. Cannot create family.");
            return;
        }
        Keyboard.dismiss();
        console.log("handleCreateFamily: Setting state to processing..."); // <-- DEBUG LOG
        setIsProcessingAction(true);
        setActionView('loading');

        // Generate code (using simplified approach without client-side check)
        const inviteCode = generateInviteCode(6);
        let newFamilyId = ''; // Will be set within the transaction
        console.log("handleCreateFamily: Generated invite code:", inviteCode); // <-- DEBUG LOG

        try {
            console.log("handleCreateFamily: Starting transaction..."); // <-- DEBUG LOG
            await runTransaction(firestore, async (transaction) => {
                console.log("handleCreateFamily: Inside transaction callback."); // <-- DEBUG LOG
                const userDocRef = doc(firestore, 'users', user.uid);
                const familyCollRef = collection(firestore, "families");

                // **Important Check inside Transaction:** Ensure user isn't already in a family
                const userSnap = await transaction.get(userDocRef);
                if (userSnap.data()?.familyId) {
                    throw new Error("User is already in a family."); // Prevent joining multiple families
                }

                const newFamilyDocRef = doc(familyCollRef); // Generate new doc ref
                newFamilyId = newFamilyDocRef.id;

                // 1. Create the new family document
                console.log("handleCreateFamily: Setting family doc:", newFamilyId); // <-- DEBUG LOG
                transaction.set(newFamilyDocRef, {
                    familyName: `${currentUserProfile.name || 'My'}'s Family`,
                    members: { [user.uid]: true },
                    inviteCode: inviteCode,
                    createdAt: serverTimestamp(),
                    adminId: user.uid
                });

                // 2. Update the user's document
                console.log("handleCreateFamily: Updating user doc:", user.uid); // <-- DEBUG LOG
                transaction.update(userDocRef, {
                    familyId: newFamilyId,
                    role: "admin"
                });
                console.log("handleCreateFamily: Transaction steps defined."); // <-- DEBUG LOG
            });

            console.log(`handleCreateFamily: Transaction successful! Family ${newFamilyId}, Code: ${inviteCode}`); // <-- DEBUG LOG
            Alert.alert("Family Created!", `Your new family invite code is: ${inviteCode}\nShare it with others to join.`);
            // The profile listener will automatically detect the familyId change and update the UI

        } catch (error: any) {
            console.error("Error creating family:", error); // <-- DEBUG LOG
            Alert.alert("Error", `Could not create the family: ${error.message || 'Please try again.'}`);
        } finally {
            console.log("handleCreateFamily: Running finally block."); // <-- DEBUG LOG
            // Only reset processing state. UI switch is handled by profile listener.
            setIsProcessingAction(false);
            // Don't reset actionView here. If transaction failed, user is still without family.
            // If successful, profile listener will change UI. Let's reset to options just in case.
             if (actionView === 'loading') { // Only reset if it was in loading state
                 setActionView('options');
             }
        }
    };

    const handleJoinFamily = async () => {
        console.log("handleJoinFamily called.");
        if (!user || !familyCodeInput) {
            Alert.alert("Input Needed", "Please enter a family invite code.");
            return;
        }
        Keyboard.dismiss();
        const codeToJoin = familyCodeInput.trim().toUpperCase();

        if (!codeToJoin) {
            Alert.alert("Input Needed", "Please enter a family invite code.");
            return;
        }

        console.log("handleJoinFamily: Setting processing state for code:", codeToJoin);
        setIsProcessingAction(true);
        setActionView('loading');

        try {
            console.log("handleJoinFamily: Querying for family with code:", codeToJoin);
            const familyQuery = query(
                collection(firestore, "families"),
                where("inviteCode", "==", codeToJoin),
                limit(1)
            );
            const querySnapshot = await getDocs(familyQuery);

            if (querySnapshot.empty) {
                console.log("handleJoinFamily: No family found for code:", codeToJoin);
                Alert.alert("Invalid Code", "No family found with that invite code. Please check the code and try again.");
                setIsProcessingAction(false);
                setActionView('join'); // Go back to join view
                return;
            }

            const familyDoc = querySnapshot.docs[0];
            const familyId = familyDoc.id;
            const familyDocRef = familyDoc.ref;
            const userDocRef = doc(firestore, 'users', user.uid);

            console.log("handleJoinFamily: Found family", familyId, "Starting transaction for user", user.uid);
            await runTransaction(firestore, async (transaction) => {
                 // **Important Check inside Transaction:** Ensure user isn't already in a family
                const userSnap = await transaction.get(userDocRef);
                if (userSnap.data()?.familyId) {
                    throw new Error("User is already in a family."); // Prevent joining multiple families
                }

                // Update the user's document
                console.log("handleJoinFamily: Updating user doc with familyId:", familyId);
                transaction.update(userDocRef, {
                    familyId: familyId,
                    role: "member"
                });

                // Update the family's member list
                console.log("handleJoinFamily: Updating family members map for user:", user.uid);
                transaction.update(familyDocRef, {
                    [`members.${user.uid}`]: true
                });
            });

            console.log(`handleJoinFamily: User ${user.uid} successfully joined family ${familyId}`);
            Alert.alert("Success!", "You have joined the family.");
            // Profile listener will handle UI update

        } catch (error: any) {
            console.error("Error joining family:", error);
            Alert.alert("Error", `Could not join the family: ${error.message || 'Please try again.'}`);
        } finally {
            console.log("handleJoinFamily: Running finally block.");
            setIsProcessingAction(false);
            setFamilyCodeInput(''); // Clear input
            // Don't reset actionView here. Let profile listener handle UI change.
             if (actionView === 'loading') { // Reset only if still loading
                 setActionView('options'); // Go back to options if join failed
             }
        }
    };


    // --- Handler for Copying Code ---
    const handleCopyCode = async (code: string) => {
        if (!code || code === 'N/A') return;
        try {
            await Clipboard.setStringAsync(code);
            Alert.alert('Copied!', 'Invite code copied to clipboard.');
        } catch (e) {
            console.error("Failed to copy code:", e);
            Alert.alert('Error', 'Could not copy code.');
        }
    };

    // --- Render Logic ---

    // Render individual family member item
    const renderFamilyMember = ({ item }: { item: FamilyMember }) => {
        const isCurrentUser = item.id === user?.uid;
        const batteryValue = item.batteryLevel ?? -1; // Use -1 if undefined/null for check
        const displayBattery = batteryValue >= 0 ? `${batteryValue}%` : 'N/A'; // Display N/A if -1 or less

        return (
          <ThemedView style={styles.memberItem}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: isCurrentUser ? Colors[colorScheme ?? 'light'].tint : '#ccc' }]} >
                <ThemedText style={styles.avatarPlaceholderText}>
                  {item.name ? item.name.substring(0, 1).toUpperCase() : '?'}
                </ThemedText>
              </View>
            )}
            <View style={styles.memberInfo}>
              <ThemedText style={styles.memberName}>{item.name || 'Unnamed Member'}{isCurrentUser ? ' (You)' : ''}</ThemedText>
              {/* Optional: Display Role */}
              {/* <ThemedText style={styles.memberRole}>{item.role || 'Member'}</ThemedText> */}
            </View>
            <ThemedText style={styles.batteryText}>
                🔋 {displayBattery}
            </ThemedText>
          </ThemedView>
        );
    };

    // Render UI for users *not* in a family
    const renderJoinCreateOptions = () => {
        // Show loading spinner full screen if processing join/create
        if (isProcessingAction) { // Use isProcessingAction instead of actionView === 'loading'
             return (
                 <View style={styles.centered}>
                     <ActivityIndicator size="large" />
                     <ThemedText style={{marginTop: 10}}>Processing...</ThemedText>
                 </View>
             );
        }

        // Show Join Family UI
        if (actionView === 'join') {
            return (
                <View style={styles.joinCreateContainer}>
                    <ThemedText style={styles.joinCreatePrompt}>Enter Family Invite Code:</ThemedText>
                    <TextInput
                        style={styles.input}
                        placeholder="Invite Code"
                        value={familyCodeInput}
                        onChangeText={setFamilyCodeInput}
                        autoCapitalize="characters"
                        maxLength={10} // Max length for code input
                        placeholderTextColor={Colors[colorScheme??'light'].icon}
                        onSubmitEditing={handleJoinFamily} // Allow submitting with keyboard return key
                        returnKeyType="go" // Show "Go" or similar on keyboard
                    />
                    <View style={styles.joinButtonContainer}>
                         <Button title="Cancel" onPress={() => setActionView('options')} color="#888888" />
                         {/* Disable button slightly differently */}
                         <Button
                             title="Join Family"
                             onPress={handleJoinFamily}
                             disabled={!familyCodeInput.trim()} // Disable if empty or only whitespace
                             color={!familyCodeInput.trim() ? "#AAAAAA" : Colors[colorScheme ?? 'light'].tint} // Grey out when disabled
                         />
                    </View>
                </View>
            );
        }

        // Default: Show initial 'options'
        return (
            <View style={styles.joinCreateContainer}>
                <ThemedText style={styles.joinCreatePrompt}>You are not part of a family.</ThemedText>
                <View style={styles.optionButton}>
                    <Button title="Join an Existing Family" onPress={() => setActionView('join')} />
                </View>
                <View style={styles.optionButton}>
                    <Button title="Create a New Family" onPress={handleCreateFamily} />
                </View>
            </View>
        );
    };


    // --- Main Return ---

    // Initial Loading State (before profile is checked)
    if (isLoading) {
        return (
            <ThemedView style={styles.centered}>
                <ActivityIndicator size="large" />
                <ThemedText>Loading...</ThemedText>
            </ThemedView>
        );
    }

    // Determine if user is in a family based on CURRENT profile state
    const isInFamily = !!currentUserProfile?.familyId;

    // Convert map to sorted array for FlatList
    const familyMembersArray = Array.from(familyMembersMap.values());
    familyMembersArray.sort((a, b) => {
        if (a.id === user?.uid) return -1; // Current user first
        if (b.id === user?.uid) return 1;
        return (a.name || '').localeCompare(b.name || ''); // Then alphabetically
    });

    return (
        <SafeAreaView style={styles.safeArea}>
            <ThemedView style={styles.container}>
                {/* Screen Title */}
                <ThemedText type="title" style={styles.title}>
                    {isInFamily ? (familyInfo?.familyName ?? 'Family Members') : 'Family Options'}
                </ThemedText>

                {/* Conditional Content */}
                {isInFamily ? (
                    <>
                        {/* Invite Code Display */}
                        {familyInfo?.inviteCode && familyInfo.inviteCode !== 'N/A' && (
                            <View style={styles.inviteCodeContainer}>
                                <ThemedText style={styles.inviteCodeLabel}>Invite Code:</ThemedText>
                                <TouchableOpacity
                                    onPress={() => handleCopyCode(familyInfo.inviteCode)}
                                    style={styles.inviteCodeTouchable}
                                    activeOpacity={0.7} // Provide visual feedback on press
                                >
                                    <ThemedText style={styles.inviteCodeText}>{familyInfo.inviteCode}</ThemedText>
                                    <IconSymbol name="doc.on.doc" size={18} color={Colors[colorScheme ?? 'light'].tint} style={styles.copyIcon}/>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Family Member List */}
                        <FlatList
                            data={familyMembersArray}
                            renderItem={renderFamilyMember}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContentContainer}
                            ListEmptyComponent={
                                // Show loading only if familyInfo is also loading, otherwise maybe "No other members"
                                !familyInfo ? <ActivityIndicator style={{marginTop: 30}}/> :
                                <ThemedText style={styles.emptyText}>No other members found.</ThemedText>
                            }
                        />
                    </>
                ) : (
                   // Render Join/Create UI if not in family
                   renderJoinCreateOptions()
                )}

            </ThemedView>
        </SafeAreaView>
    );
}

// --- Styles ---
const createStyles = (colorScheme: 'light' | 'dark' | null | undefined) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors[colorScheme ?? 'light'].background,
    },
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors[colorScheme ?? 'light'].background,
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginVertical: 20, // Use margin vertical for spacing
        paddingHorizontal: 16,
        color: Colors[colorScheme ?? 'light'].text,
    },
    listContentContainer: {
        paddingHorizontal: 16,
        paddingBottom: 30 // Ensure space at the bottom of list
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors[colorScheme ?? 'light'].icon,
        backgroundColor: Colors[colorScheme ?? 'light'].background,
    },
    avatar: {
        width: 45, height: 45, borderRadius: 22.5, marginRight: 12,
        backgroundColor: '#e0e0e0' // Background color for image loading/failure
    },
    avatarPlaceholder: {
        width: 45, height: 45, borderRadius: 22.5, marginRight: 12,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarPlaceholderText: {
        color: '#fff', fontSize: 18, fontWeight: 'bold',
    },
    memberInfo: {
        flex: 1, justifyContent: 'center',
    },
    memberName: {
        fontSize: 16, fontWeight: '500', color: Colors[colorScheme ?? 'light'].text,
    },
    memberRole: { // Optional style for role
        fontSize: 12, color: Colors[colorScheme ?? 'light'].icon, marginTop: 2,
    },
    batteryText: {
        fontSize: 14, color: Colors[colorScheme ?? 'light'].icon, marginLeft: 8,
    },
    emptyText: {
        textAlign: 'center', marginTop: 50, fontSize: 16, color: Colors[colorScheme ?? 'light'].icon,
    },
    // --- Styles for Join/Create Options (Revised Layout) ---
    joinCreateContainer: {
        flex: 1, // Take remaining space
        paddingTop: 20, // Space below title
        paddingHorizontal: 25, // Consistent horizontal padding
    },
    joinCreatePrompt: {
        fontSize: 17,
        textAlign: 'center', // Center the prompt text
        marginBottom: 25, // Space below prompt
        color: Colors[colorScheme ?? 'light'].text,
        lineHeight: 24, // Improve readability
    },
    input: {
        height: 45,
        borderColor: Colors[colorScheme ?? 'light'].icon,
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 20,
        paddingHorizontal: 15,
        width: '100%',
        fontSize: 16,
        color: Colors[colorScheme ?? 'light'].text,
        backgroundColor: Colors[colorScheme ?? 'light'].background, // Use specific input background if defined
    },
    optionButton: { // Style for wrapping each option button
        width: '100%', // Make wrapper full width
        marginBottom: 15, // Space between buttons
    },
    joinButtonContainer: { // Container for Join/Cancel buttons
        flexDirection: 'row',
        justifyContent: 'space-between', // Space out Join/Cancel
        width: '100%',
        marginTop: 10, // Space above buttons
    },
    // --- Styles for Invite Code Display ---
    inviteCodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginBottom: 15,
        backgroundColor: Colors[colorScheme ?? 'light'].background,
    },
    inviteCodeLabel: {
        fontSize: 15,
        marginRight: 8,
        color: Colors[colorScheme ?? 'light'].icon,
    },
    inviteCodeTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: (Colors[colorScheme ?? 'light'].tint ?? '#0a7ea4') + '20', // Add alpha, provide fallback tint
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    inviteCodeText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors[colorScheme ?? 'light'].tint ?? '#0a7ea4', // Provide fallback tint
        letterSpacing: 1,
    },
    copyIcon: {
        marginLeft: 8,
    }
});
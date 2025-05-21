// --- Imports ---
import React, { useState, useEffect, Suspense, lazy, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Alert, ActivityIndicator, Platform, TouchableOpacity } from 'react-native'; // Removed AppState for now, can add if needed for background checks
import type { Region } from 'react-native-maps';

// Firebase Imports
import { database, firestore, auth } from '@/config/firebaseConfig';
import { ref, onValue, set, serverTimestamp as rtdbServerTimestamp, Unsubscribe } from 'firebase/database';
import { collection, doc, getDoc, onSnapshot, query, where, GeoPoint, Timestamp, serverTimestamp as firestoreServerTimestamp, addDoc, getDocs } from 'firebase/firestore'; // Added getDocs

// Context and Hooks
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';

// Expo APIs
import * as Location from 'expo-location';
// import * as Notifications from 'expo-notifications'; // REMOVE - Not using Expo notifications for push
import * as Battery from 'expo-battery';

// Project Components, Constants, Utils
import { Colors } from '@/constants/Colors';
// Assuming LazyMapViewComponent is defined/imported elsewhere or replace with actual MapViewWrapper import
// Adjust the import path based on your structure
const LazyMapViewComponent = Platform.OS !== 'web'
  ? lazy(async () => {
      const module = await import('../../components/MapViewWrapper'); // *** ADJUST PATH ***
      return { default: module.default };
    })
  : null;
// Ensure NotificationPayload is exported from the notifications utility file
import { createNotificationsForFamily, NotificationPayload } from '@/utils/notifications'; // *** ADJUST PATH ***
import { getDistance } from '@/utils/helpers'; // *** ADJUST PATH & ENSURE DEFINED ***

// --- Define Data Structures ---
interface UserProfile { id: string; name: string; email?: string; avatarUrl?: string; familyId?: string | null; role?: string | null;
  settings?: {
  shareLocation?: boolean;
  batteryAlerts?: boolean;
}; }
interface LiveData { currentLocation?: { latitude: number; longitude: number; timestamp: number | object; }; batteryLevel?: number; }
export interface FamilyMember extends UserProfile, LiveData {} // Export if needed
export interface Geofence { id: string; name: string; center: { latitude: number; longitude: number; }; radius: number; familyId?: string; }



// Also useful to have the Firestore version structure type
export interface GeofenceDocument {
    name: string;
    familyId: string;
    center: GeoPoint; // Firestore uses GeoPoint
    radius: number;
    createdAt?: Timestamp; // Optional: track creation
}
// --- Constants ---
const DEFAULT_REGION: Region = { latitude: 37.78825, longitude: -122.4324, latitudeDelta: 0.0922, longitudeDelta: 0.0421, };
const LOW_BATTERY_THRESHOLD = 20;
const BATTERY_COOLDOWN_PERIOD = 15 * 60 * 1000; // 15 mins
const GEOFENCE_COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 mins
const LOCATION_UPDATE_INTERVAL = 30000; // 30 seconds
const MIN_HISTORY_DISTANCE_METERS = 50; // e.g., only save if moved 50 meters


// --- Component ---
export default function MapScreen() {
  const { user, loadingAuth } = useAuth();
  const colorScheme = useColorScheme();
  const styles = createStyles(colorScheme);

  // --- State ---
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<Map<string, FamilyMember>>(new Map());
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState(false); // For SOS button loading state
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  // Removed notificationPermissionStatus state

  // --- Refs ---
  const initialRegionSet = useRef(false);
  const isMounted = useRef(true);
  const previousUserLocation = useRef<LiveData['currentLocation'] | null>(null);
  const lastLowBatteryAlertSent = useRef<number | null>(null);
  const geofenceCooldowns = useRef<Map<string, number>>(new Map());
  const rtdbListeners = useRef<Map<string, Unsubscribe>>(new Map());
  const locationIntervalId = useRef<NodeJS.Timeout | null>(null);
  const batterySubscription = useRef<Battery.Subscription | null>(null);
  const firestoreListeners = useRef<{ members?: Unsubscribe, geofences?: Unsubscribe, profile?: Unsubscribe }>({});
  const lastRecordedHistoryLocation = useRef<{ latitude: number; longitude: number } | null>(null);



  // --- Helper Function to Update State ---
  const updateMemberInState = useCallback((memberId: string, updateFn: (member: FamilyMember | undefined) => Partial<FamilyMember>) => {
    if (!isMounted.current) return;
    setFamilyMembers(prevMap => {
      const existingMember = prevMap.get(memberId);
      const updates = updateFn(existingMember);
      const newMap = new Map(prevMap);

      // Merge: Start with existing data, then updates
      const mergedData = {
          ...(existingMember || {}),
          ...updates,
      };

      // --- Ensure Required Fields ---
      // Guarantee 'name' is a string, provide a default if missing
      const finalName = mergedData.name || existingMember?.name || ''; // Use existing name or empty string as fallback

      const updatedMember: FamilyMember = {
          ...mergedData, // Spread the merged data
          id: memberId,      // Ensure ID is present
          name: finalName,   // Assign the guaranteed string name
          // You might need similar checks for other *required* fields in FamilyMember
          // if they aren't guaranteed by UserProfile/LiveData interfaces
      };
      // --- End Ensure Required Fields ---


      // Only set if we have meaningful data (name is now guaranteed non-empty temporarily if profile loaded)
      if (updatedMember.name || existingMember?.name) {
          newMap.set(memberId, updatedMember);
          return newMap;
      } else {
          console.log(`Skipping state set for ${memberId} - profile likely not loaded yet.`);
          return prevMap;
      }
    });
  }, []);


  // --- Effect 1: Permissions & Basic Setup ---
  useEffect(() => {
    isMounted.current = true;
    console.log("Effect 1: Permissions running...");

    const setupPermissions = async () => {
      try {
        let locStatusResult = await Location.requestForegroundPermissionsAsync();
        if (isMounted.current) {
            setLocationPermissionStatus(locStatusResult.status);
            console.log("Location permission status:", locStatusResult.status);
            if (locStatusResult.status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required.');
                setIsLoading(false); // Stop loading if permission denied
            }
        }
        // Removed notification permission request
      } catch (error) {
        console.error("Error during permission setup:", error);
        if (isMounted.current) setIsLoading(false);
        Alert.alert("Permission Error", "Failed to request location permission.");
      }
    };

    setupPermissions();

    return () => {
      console.log("Effect 1 Cleanup: Setting isMounted to false.");
      isMounted.current = false;
    };
  }, []); // Run only once


  // --- Function to Fetch Device Location and Update RTDB ---
  const fetchDeviceLocationAndUpdateRtdb = useCallback(async () => {

    const shareLocationEnabled = currentUserProfile?.settings?.shareLocation ?? true; // Default to true
    if (!shareLocationEnabled) {
         console.log("Skipping location update: Sharing disabled by user setting.");
         return; // Exit if sharing is disabled
    }

    if (!user || locationPermissionStatus !== 'granted' || !isMounted.current) {
      return;
    }

    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const newLat = location.coords.latitude;
      const newLon = location.coords.longitude;

      // Prepare RTDB data
      const rtdbLocationData = { latitude: newLat, longitude: newLon, timestamp: rtdbServerTimestamp() };

      // Update RTDB (do this every time)
      const locationRef = ref(database, `liveData/${user.uid}/currentLocation`);
      await set(locationRef, rtdbLocationData);
      // console.log('Location updated in RTDB for user:', user.uid);


      // --- Check Distance Before Writing Location History ---
      let shouldWriteHistory = true; // Default to true for the first point

      if (lastRecordedHistoryLocation.current) {
          // Calculate distance from the last SAVED point
          const distanceMoved = getDistance(
              lastRecordedHistoryLocation.current.latitude,
              lastRecordedHistoryLocation.current.longitude,
              newLat,
              newLon
          );

          // Check if distance exceeds threshold
          if (distanceMoved < MIN_HISTORY_DISTANCE_METERS) {
              shouldWriteHistory = false;
              console.log(`Skipping history write: Moved only ${distanceMoved.toFixed(1)}m`);
          } else {
               console.log(`Recording history: Moved ${distanceMoved.toFixed(1)}m`);
          }
      } else {
           console.log("Recording history: First point after mount/start.");
      }


      // --- Conditionally Write Location History ---
      if (shouldWriteHistory) {
          try {
              const historyRef = collection(firestore, 'locationHistory');
              await addDoc(historyRef, {
                userId: user.uid,
                location: new GeoPoint(newLat, newLon),
                timestamp: firestoreServerTimestamp()
              });
              // ** IMPORTANT: Update the ref ONLY after successful write **
              lastRecordedHistoryLocation.current = { latitude: newLat, longitude: newLon };
              console.log('Location history added to Firestore.');
          } catch (histError) {
              console.error("Failed to write location history:", histError);
              // Don't update lastRecordedHistoryLocation.current if write failed
          }
      }
      // --- End Location History Logic ---


    } catch (error: any) {
       if (error.code !== 'E_LOCATION_SETTINGS_UNSATISFIED') {
            console.error("Error fetching/updating location: ", error.message);
       }
    }
  }, [user, locationPermissionStatus]); // Recreate if user or permission changes


  // --- Effect 2: Fetch Current User Profile & Start Location Interval ---
  useEffect(() => {
    if (!user || locationPermissionStatus !== 'granted' || !isMounted.current) {
      // Cleanup interval if conditions not met
      if (locationIntervalId.current) {
        clearInterval(locationIntervalId.current);
        locationIntervalId.current = null;
      }
      // Reset loading state if needed
      if (!isLoading && !currentUserProfile && locationPermissionStatus === 'granted') {
         setIsLoading(false);
      }
      return; // Exit if no user or permission
    }

    console.log("Effect 2: Setting up Profile Listener & Location Interval for:", user.uid);

    // Listener for current user's profile
    const userDocRef = doc(firestore, 'users', user.uid);
    firestoreListeners.current.profile = onSnapshot(userDocRef, (docSnap) => {
      if (!isMounted.current) return; // Check if still mounted

      if (docSnap.exists()) {
        const profileData = { id: docSnap.id, ...docSnap.data() } as UserProfile;
        setCurrentUserProfile(profileData); // Update profile state
        updateMemberInState(user.uid, (existing) => ({ ...profileData, ...existing })); // Merge profile, keep live data

        // Start location update interval if not already running
        if (!locationIntervalId.current) {
          console.log("Effect 2: Starting location update interval.");
          fetchDeviceLocationAndUpdateRtdb(); // Fetch immediately
          locationIntervalId.current = setInterval(fetchDeviceLocationAndUpdateRtdb, LOCATION_UPDATE_INTERVAL);
        }
      } else {
        console.error("Effect 2: User document missing!");
        setCurrentUserProfile(null);
        setIsLoading(false);
        if (locationIntervalId.current) { // Stop interval if profile gone
          clearInterval(locationIntervalId.current);
          locationIntervalId.current = null;
        }
      }
    }, (error) => {
      if (!isMounted.current) return;
      console.error("Effect 2: Error fetching user profile:", error);
      setCurrentUserProfile(null);
      setIsLoading(false);
      if (locationIntervalId.current) { // Stop interval on error
        clearInterval(locationIntervalId.current);
        locationIntervalId.current = null;
      }
    });

    // Cleanup for Effect 2
    return () => {
      console.log("Effect 2 Cleanup.");
      if (locationIntervalId.current) {
        clearInterval(locationIntervalId.current);
        locationIntervalId.current = null;
      }
      firestoreListeners.current.profile?.();
      firestoreListeners.current.profile = undefined;
    };
  }, [user, locationPermissionStatus, fetchDeviceLocationAndUpdateRtdb, updateMemberInState]);


  // --- Effect 3: Fetch Family Data, Geofences, Setup RTDB Listeners ---
  useEffect(() => {
    const familyId = currentUserProfile?.familyId;

    const cleanupEffect3 = () => {
      console.log("Effect 3 Cleanup.");
      firestoreListeners.current.members?.();
      firestoreListeners.current.members = undefined;
      firestoreListeners.current.geofences?.();
      firestoreListeners.current.geofences = undefined;
      rtdbListeners.current.forEach(unsubscribe => unsubscribe());
      rtdbListeners.current.clear();
      previousUserLocation.current = null;
    };

    if (!user || !familyId || !isMounted.current) {
      console.log("Effect 3: Skipping - No user/familyId or unmounted.");
      cleanupEffect3();
      setFamilyMembers(prev => { /* Keep self */ const nm=new Map(); const s=prev.get(user?.uid??''); if(s) nm.set(user!.uid,s); return nm; });
      setGeofences([]);
      if (currentUserProfile && !familyId) setIsLoading(false);
      return;
    }

    console.log(`Effect 3: Setting up listeners for familyId: ${familyId}`);
    // Don't set isLoading true here if profile effect already did, wait for data

    // --- 1. Fetch/Listen to Family Member Profiles ---
    const membersQuery = query(collection(firestore, 'users'), where("familyId", "==", familyId));
    firestoreListeners.current.members = onSnapshot(membersQuery, (querySnapshot) => {
      if (!isMounted.current) return;
       console.log(`Effect 3: Firestore members snapshot (${querySnapshot.size}). IDs found:`, querySnapshot.docs.map(d => d.id));
       const currentMemberIds = new Set<string>();
       const currentProfiles = new Map<string, UserProfile>(); // Store profiles from THIS snapshot

       querySnapshot.forEach((doc) => {
           const profile = { id: doc.id, ...doc.data() } as UserProfile;
           currentProfiles.set(doc.id, profile);
           currentMemberIds.add(doc.id);
       });

        console.log("Effect 3: familyMembers state BEFORE update:", JSON.stringify(Array.from(familyMembers.entries())));

        // --- MODIFIED STATE UPDATE ---
        // Build the *next* state map completely based on current snapshot and previous live data
        setFamilyMembers(prevMembersMap => {
          console.log("Effect 3: familyMembers state BEFORE update (in setter):", JSON.stringify(Array.from(prevMembersMap.entries())));
          const newCombinedMap = new Map<string, FamilyMember>();
          let changed = false;

          // Iterate through profiles found in THIS snapshot
          currentProfiles.forEach((profile, memberId) => {
              const existingMemberData = prevMembersMap.get(memberId); // Get previous full data
              newCombinedMap.set(memberId, {
                  ...(existingMemberData || {}), // Start with previous data (includes live data)
                  ...profile, // Overwrite with fresh profile data
                  id: memberId, // Ensure ID is present
              });
          });

          // Identify and remove members who are no longer in the family
          prevMembersMap.forEach((_, memberId) => {
              if (!currentProfiles.has(memberId)) {
                  newCombinedMap.delete(memberId);
                  changed = true;
                  // Cleanup RTDB listener for removed member
                  const unsub = rtdbListeners.current.get(memberId);
                  if (unsub) {
                      unsub();
                      rtdbListeners.current.delete(memberId);
                      console.log(`Effect 3: Removed RTDB listener (left member): ${memberId}`);
                  }
              }
          });

          // Check if the map content actually changed before returning a new map
          if (!changed && newCombinedMap.size === prevMembersMap.size) {
            
          }

          console.log("Effect 3: familyMembers state AFTER update calculation (in setter):", JSON.stringify(Array.from(newCombinedMap.entries())));
          return newCombinedMap; // Return the newly calculated map
      });
        // Manage RTDB Listeners (logic remains the same, but use currentMemberIds from this snapshot)
        // Unsubscribe from members no longer in the family (based on currentMemberIds)
        rtdbListeners.current.forEach((unsubscribe, memberId) => {
            if (!currentMemberIds.has(memberId)) { // Check against IDs found in THIS snapshot
                console.log(`Effect 3: Removing RTDB listener for left member: ${memberId}`);
                unsubscribe();
                rtdbListeners.current.delete(memberId);
                // Also remove from the state map directly here if they were missed above
                // This requires setFamilyMembers again, might be simpler to rely on next snapshot
            }
        });

        // Subscribe to new members found in this snapshot
        currentMemberIds.forEach(memberId => {
            if (!rtdbListeners.current.has(memberId)) {
                console.log(`Effect 3: Adding RTDB listener for member: ${memberId}`);
                const liveDataRef = ref(database, `liveData/${memberId}`);
                const unsubscribeRtdb = onValue(liveDataRef, (snapshot) => {
                    if (!isMounted.current) return;
                    const liveData = snapshot.val() as LiveData | null;
                    // Use the reliable update helper here
                    updateMemberInState(memberId, (existing) => {
                       // Explicitly determine the new location and battery,
                        // defaulting to undefined if not present in the RTDB snapshot
                        const newLocation = liveData?.currentLocation ?? undefined;
                        const newBattery = liveData?.batteryLevel ?? undefined;

                        // Return the update object, ensuring existing profile data is kept
                        // and the new live data overwrites any old live data
                        return {
                            ...(existing || {}), // Keep existing profile (name, email, etc.)
                            currentLocation: newLocation, // Set to new location OR undefined
                            batteryLevel: newBattery,     // Set to new battery OR undefined
                        };
                    });
                    // Initial map centering (logic unchanged)
                    if (memberId === user?.uid && liveData?.currentLocation?.latitude && !initialRegionSet.current) {
                         setMapRegion({ latitude: liveData.currentLocation.latitude, longitude: liveData.currentLocation.longitude, latitudeDelta: 0.02, longitudeDelta: 0.01 });
                         initialRegionSet.current = true;
                    }
                    // Geofence check (logic unchanged)
                     if (memberId === user?.uid && liveData?.currentLocation) {
                         if(previousUserLocation.current) checkCurrentUserGeofences(liveData.currentLocation);
                         previousUserLocation.current = liveData.currentLocation;
                     }
                }, (error) => { console.error(`RTDB Error (${memberId}):`, error); });
                rtdbListeners.current.set(memberId, unsubscribeRtdb);
            }
        });

        setIsLoading(false); // Set loading false after processing

    }, (error) => { // Error handler for members query
         if (!isMounted.current) return;
        console.error("Effect 3: Error fetching family member profiles: ", error); setIsLoading(false);
    });

    // --- 2. Fetch/Listen to Geofences ---
    const geofencesQuery = query(collection(firestore, 'geofences'), where("familyId", "==", familyId));
    firestoreListeners.current.geofences = onSnapshot(geofencesQuery, (querySnapshot) => {
        if (!isMounted.current) return;
        console.log(`Effect 3: Geofences snapshot (${querySnapshot.size}).`);
        const fences: Geofence[] = [];
        querySnapshot.forEach((doc) => { const data = doc.data(); const centerData = data.center as GeoPoint; if (centerData?.latitude && centerData?.longitude && data.radius) { fences.push({ id: doc.id, name: data.name || 'Unnamed Zone', center: { latitude: centerData.latitude, longitude: centerData.longitude }, radius: data.radius, familyId: data.familyId }); }});
        setGeofences(fences);
    }, (error) => { if (!isMounted.current) return; console.error("Effect 3: Error fetching geofences: ", error); });

    // --- Cleanup ---
    return cleanupEffect3;

  }, [user, currentUserProfile?.familyId, updateMemberInState]); // Dependencies


  // --- Battery Listener Effect (Client-Side Notification) ---
  useEffect(() => {
      if (!user || !isMounted.current) {
        batterySubscription.current?.remove(); batterySubscription.current = null;
        return;
      }
      if (!batterySubscription.current) {
         console.log("Effect Battery: Setting up battery listener...");
         batterySubscription.current = Battery.addBatteryLevelListener(async ({ batteryLevel: level }) => {
            if (!isMounted.current) return;
            const newLevel = Math.round(level * 100);
            const profile = currentUserProfile;
            const currentFamilyId = profile?.familyId;

            // Update RTDB
            const batteryRef = ref(database, `/liveData/${user.uid}/batteryLevel`);
            set(batteryRef, newLevel).catch(err => console.error("RTDB battery update failed:", err));
            // Update local state map
            updateMemberInState(user.uid, () => ({ batteryLevel: newLevel }));

            // --- Check Low Battery & Send Notification ---
            if (newLevel <= LOW_BATTERY_THRESHOLD && profile && currentFamilyId) {
              const batteryAlertsEnabled = profile.settings?.batteryAlerts ?? true; // Default true
              if (!batteryAlertsEnabled) {
                console.log("Skipping low battery notification: Disabled by user setting.");
                return; // Exit if alerts are disabled
            }
                const now = Date.now();
                if (!lastLowBatteryAlertSent.current || (now - lastLowBatteryAlertSent.current > BATTERY_COOLDOWN_PERIOD)) {
                    console.log(`Low battery detected for self (${newLevel}%). Storing notification.`);
                    lastLowBatteryAlertSent.current = now;
                    const notificationPayload: NotificationPayload = { type: 'low_battery', title: `Low Battery: ${profile.name || 'A family member'}`, message: `${profile.name || 'A family member'}'s phone battery is low (${newLevel}%).`, familyId: currentFamilyId, triggeringUid: user.uid, };
                    await createNotificationsForFamily(user.uid, notificationPayload);
                }
            } else if (newLevel > LOW_BATTERY_THRESHOLD) {
                 lastLowBatteryAlertSent.current = null; // Reset cooldown
            }
         });
         // Fetch initial level
          Battery.getBatteryLevelAsync().then(initialBattery => { if (!isMounted.current) return; const initialLevel = Math.round(initialBattery * 100); const initialBatteryRef = ref(database, `liveData/${user.uid}/batteryLevel`); set(initialBatteryRef, initialLevel); updateMemberInState(user.uid, () => ({ batteryLevel: initialLevel })); }).catch(err => console.warn("Could not get initial battery level:", err));
      }
      return () => { // Cleanup
          console.log("Effect Battery: Cleaning up battery listener.");
          batterySubscription.current?.remove(); batterySubscription.current = null;
      };
  }, [user, currentUserProfile, updateMemberInState]); // Dependencies


  // --- Function to Check Geofences for Current User (Client-Side Notification) ---
  const checkCurrentUserGeofences = (newLocation: LiveData['currentLocation']) => {
      const currentLoc = newLocation;
      const previousLoc = previousUserLocation.current;
      if (!user || !currentLoc?.latitude || !previousLoc?.latitude || geofences.length === 0 || !currentUserProfile?.familyId) { return; }

      const now = Date.now();
      const promises: Promise<boolean>[] = [];

      geofences.forEach((fence) => {
           if (!fence.center?.latitude || !fence.center.longitude || !fence.radius) return;

           const distanceOld = getDistance(previousLoc!.latitude, previousLoc!.longitude, fence.center.latitude, fence.center.longitude);
           const distanceNew = getDistance(currentLoc.latitude, currentLoc.longitude, fence.center.latitude, fence.center.longitude);
           const wasInside = distanceOld <= fence.radius;
           const isInside = distanceNew <= fence.radius;
           let eventType: NotificationPayload['type'] | null = null;
           let message = "";

           if (!wasInside && isInside) { eventType = "geofence_entry"; message = `${currentUserProfile.name || 'A member'} arrived at ${fence.name}.`; }
           else if (wasInside && !isInside) { eventType = "geofence_exit"; message = `${currentUserProfile.name || 'A member'} left ${fence.name}.`; }

           if (eventType) {
               const lastAlertTime = geofenceCooldowns.current.get(fence.id);
               if (!lastAlertTime || (now - lastAlertTime > GEOFENCE_COOLDOWN_PERIOD)) {
                   console.log(`Geofence event: ${eventType} for fence ${fence.name}. Storing notification.`);
                   geofenceCooldowns.current.set(fence.id, now);
                   const notificationPayload: NotificationPayload = { type: eventType, title: fence.name, message: message, familyId: currentUserProfile.familyId!, triggeringUid: user.uid, relatedGeofenceId: fence.id, relatedLocation: { latitude: currentLoc.latitude, longitude: currentLoc.longitude }, };
                   promises.push(createNotificationsForFamily(user.uid, notificationPayload));
               }
           }
      });
      Promise.all(promises).then(results => { if (results.some(r => !r)) console.warn("Some geofence notifications failed to store."); });
  };


  // --- SOS Handler (Client-Side Notification) ---
  const handleSosPress = async () => {
      // Initial checks remain the same
      if (!user || !currentUserProfile?.familyId) {
        Alert.alert("Error", "Cannot send SOS. User profile or family information missing.");
        return;
    }

    setIsProcessingAction(true); // Show loading indicator

    // Fetch latest location first
    await fetchDeviceLocationAndUpdateRtdb();
    // Brief delay to allow RTDB listener to potentially update the state map
    await new Promise(resolve => setTimeout(resolve, 300)); // Increased delay slightly

    // --- Corrected Data Fetching ---
    // Get the full combined data (profile + live) from the state map
    const latestMemberData: FamilyMember | undefined = familyMembers.get(user.uid);

    // Use data primarily from the map state, fall back to profile state ONLY for static info
    const userName = latestMemberData?.name || currentUserProfile.name || 'A family member';
    const familyId = currentUserProfile.familyId!; // Already checked this isn't null

    // Access live data ONLY from latestMemberData (which is type FamilyMember | undefined)
    const locationData = latestMemberData?.currentLocation;
    const batteryData = latestMemberData?.batteryLevel;
    // --- End Corrected Data Fetching ---

    // Construct messages using potentially undefined live data
    const locationInfo = locationData?.latitude ? `at ${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)}` : 'at an unknown location';
    const batteryInfo = batteryData !== undefined && batteryData !== null ? `${batteryData}%` : 'N/A';
    const timestamp = locationData?.timestamp ? new Date(locationData.timestamp as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}) : 'now'; // Format time
    const messageBody = `${userName} needs help ${locationInfo} (reported ${timestamp}). Battery: ${batteryInfo}`;

    // Prepare notification payload
    const notificationPayload: NotificationPayload = {
        type: 'sos',
        title: `🆘 SOS Activated by ${userName}!`,
        message: messageBody,
        familyId: familyId,
        triggeringUid: user.uid,
        // Only include relatedLocation if locationData and its properties are valid numbers
        relatedLocation: (locationData && typeof locationData.latitude === 'number' && typeof locationData.longitude === 'number')
                           ? { latitude: locationData.latitude, longitude: locationData.longitude }
                           : null
    };

    // Send notifications using the helper
    const success = await createNotificationsForFamily(user.uid, notificationPayload);

    Alert.alert(
        success ? 'SOS Sent' : 'SOS Issue',
        success ? 'An emergency alert has been recorded for your family members.' : 'Could not record the alert for all members.'
    );

    setIsProcessingAction(false); // Hide loading indicator
  };

  // --- Render Logic ---
  if (loadingAuth || (isLoading && !currentUserProfile)) { // Simplified loading
      return ( <View style={styles.centered}><ActivityIndicator size="large" /><Text>Loading...</Text></View> );
  }
  if (locationPermissionStatus !== 'granted') {
      return ( <View style={styles.centered}><Text style={styles.permissionText}>Location permission required.</Text></View> );
  }

  const familyMembersArray = Array.from(familyMembers.values());
  console.log("MapViewWrapper Input Check:", JSON.stringify(familyMembersArray.map(m => ({id: m.id, name: m.name, lat: m.currentLocation?.latitude, lon: m.currentLocation?.longitude})), null, 2)); // Log relevant fields
  return (
      <View style={styles.container}>
        {Platform.OS === 'web' ? (
          <View style={styles.centered}><Text>Map not available on web.</Text></View>
        ) : (
          <Suspense fallback={<View style={styles.centered}><ActivityIndicator size="large" /></View>}>
            {LazyMapViewComponent && (
              <LazyMapViewComponent
                mapRegion={mapRegion}
                setMapRegion={setMapRegion}
                currentUserId={user?.uid}
                familyMembers={familyMembersArray}
                geofences={geofences}
                colorScheme={(colorScheme ?? 'light') as 'light' | 'dark'}
              />
            )}
          </Suspense>
        )}
        {/* Show SOS only if user is authenticated and in a family */}
        {user && currentUserProfile?.familyId && (
            <TouchableOpacity
                style={styles.sosButton}
                onPress={handleSosPress}
                disabled={isProcessingAction}
            >
                {isProcessingAction ? <ActivityIndicator color="#fff" /> : <Text style={styles.sosButtonText}>SOS</Text>}
            </TouchableOpacity>
        )}
      </View>
    );

} // End of component

// --- Styles ---
const createStyles = (colorScheme: 'light' | 'dark' | null | undefined) => StyleSheet.create({
   container: { flex: 1, backgroundColor: Colors[colorScheme ?? 'light'].background, },
   centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors[colorScheme ?? 'light'].background, padding: 20, },
   permissionText: { textAlign: 'center', fontSize: 16, marginBottom: 10, color: Colors[colorScheme ?? 'light'].text, },
   sosButton: { position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 30, right: 20, backgroundColor: 'red', width: 65, height: 65, borderRadius: 32.5, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 4, },
   sosButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold', },
});
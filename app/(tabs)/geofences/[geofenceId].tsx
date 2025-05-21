// app/geofences/[geofenceId].tsx

import React, { useState, useEffect, useRef } from 'react';
import {
    View, TextInput, Button, StyleSheet, Alert, ScrollView,
    ActivityIndicator, Text, SafeAreaView, Platform, KeyboardAvoidingView,
    Pressable
} from 'react-native';
import MapView, { Marker, Circle, Region, LatLng } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { doc, getDoc, addDoc, updateDoc, deleteDoc, GeoPoint, collection, serverTimestamp, Timestamp } from 'firebase/firestore';

import { firestore } from '@/config/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
// Assuming FamilyMember might have currentLocation for initial centering
import { FamilyMember } from '@/app/(tabs)'; // Adjust path if FamilyMember is elsewhere
// Define GeofenceDocument structure
interface GeofenceDocument {
    name: string;
    familyId: string;
    center: GeoPoint;
    radius: number;
    createdAt?: Timestamp; // Firestore Timestamp for creation
}

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView'; // If used for background
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/ui/IconSymbol';

const INITIAL_RADIUS = 200; // Default radius in meters
const MIN_RADIUS = 50;
const MAX_RADIUS = 5000;

const GEOFENCE_COLORS = {
    light: { stroke: 'rgba(0, 122, 255, 0.7)', fill: 'rgba(0, 122, 255, 0.25)' }, // iOS Blue
    dark: { stroke: 'rgba(10, 132, 255, 0.8)', fill: 'rgba(10, 132, 255, 0.3)' }, // Brighter iOS Blue
};

export default function GeofenceEditScreen() {
  const router = useRouter();
  const { geofenceId } = useLocalSearchParams<{ geofenceId: string }>();
  const isCreating = geofenceId === 'new';
  const actualGeofenceId = isCreating ? undefined : geofenceId;

  const { user, currentUserProfile }: { user: any, currentUserProfile: FamilyMember | null } = useAuth();
  const colorScheme = useColorScheme();
  const styles = useStyles(colorScheme);
  const mapRef = useRef<MapView>(null);

  const [name, setName] = useState('');
  const [radius, setRadius] = useState(INITIAL_RADIUS);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isAdmin = currentUserProfile?.role === 'admin';

  useEffect(() => {
    const setupScreen = async () => {
      setIsLoading(true);
      if (!isCreating && actualGeofenceId) {
        try {
          const docRef = doc(firestore, 'geofences', actualGeofenceId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const centerGeoPoint = data.center as GeoPoint;
            if (centerGeoPoint?.latitude && centerGeoPoint?.longitude && typeof data.radius === 'number') {
              const fetchedCenter = { latitude: centerGeoPoint.latitude, longitude: centerGeoPoint.longitude };
              setName(data.name || '');
              setRadius(data.radius);
              setCenter(fetchedCenter);
              setInitialRegion({ latitude: fetchedCenter.latitude, longitude: fetchedCenter.longitude, latitudeDelta: 0.022 * (data.radius / 200), longitudeDelta: 0.012 * (data.radius / 200) });
            } else { throw new Error("Invalid geofence data from Firestore."); }
          } else { throw new Error("Geofence not found."); }
        } catch (error: any) {
          console.error("Error fetching geofence:", error);
          Alert.alert("Error", `Could not load geofence data: ${error.message}`);
          router.back();
        }
      } else { // Creating new
        try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          let fetchedCenter = { latitude: 37.78825, longitude: -122.4324 }; // Default
          let zoomDelta = { latitudeDelta: 0.0922, longitudeDelta: 0.0421 };
          if (status === 'granted') {
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            fetchedCenter = { latitude: location.coords.latitude, longitude: location.coords.longitude };
            zoomDelta = { latitudeDelta: 0.01, longitudeDelta: 0.01 };
          } else { Alert.alert('Permission Denied', 'Using default map location.'); }
          setCenter(fetchedCenter);
          setInitialRegion({ ...fetchedCenter, ...zoomDelta });
        } catch (error) {
          console.error("Error getting current location:", error);
          const defaultCenter = { latitude: 37.78825, longitude: -122.4324 };
          setCenter(defaultCenter); setInitialRegion({ ...defaultCenter, latitudeDelta: 0.0922, longitudeDelta: 0.0421 });
          Alert.alert("Location Error", "Using default map location.");
        }
      }
      setIsLoading(false);
    };
    setupScreen();
  }, [actualGeofenceId, isCreating]);


  const handleMapPress = (event: any) => {
    if (!isAdmin && !isCreating) return; // Allow setting for new even if not admin (admin rights checked on save)
    const coordinate = event.nativeEvent.coordinate as LatLng;
    setCenter(coordinate);
    mapRef.current?.animateToRegion({
        ...coordinate,
        latitudeDelta: 0.022 * (Math.max(radius, MIN_RADIUS) / 400), // Ensure radius isn't 0 for delta
        longitudeDelta: 0.012 * (Math.max(radius, MIN_RADIUS) / 400),
    }, 300);
  };

  const handleSave = async () => {
    if (!user || !currentUserProfile?.familyId) { Alert.alert("Error", "User or family information missing."); return; }
    if (!isAdmin) { Alert.alert("Permission Denied", "Only admins can save geofences."); return; }
    if (!center) { Alert.alert("Invalid Data", "Please set a center location on the map."); return; }
    if (!name.trim()) { Alert.alert("Invalid Data", "Please enter a name for the geofence."); return; }
    if (radius < MIN_RADIUS || radius > MAX_RADIUS) { Alert.alert("Invalid Data", `Radius must be between ${MIN_RADIUS}m and ${MAX_RADIUS}m.`); return; }

    setIsSaving(true);
    const familyId = currentUserProfile.familyId;
    const geofenceDataToSave: GeofenceDocument = {
      name: name.trim(), radius: Math.round(radius),
      center: new GeoPoint(center.latitude, center.longitude),
      familyId: familyId,
    };

    try {
      if (!isCreating && actualGeofenceId) {
        const docRef = doc(firestore, 'geofences', actualGeofenceId);
        await updateDoc(docRef, geofenceDataToSave as any); // Cast for Firestore SDK if strict type issues
        Alert.alert("Success", "Geofence updated.");
      } else {
        const dataWithTimestamp = { ...geofenceDataToSave, createdAt: serverTimestamp() };
        await addDoc(collection(firestore, 'geofences'), dataWithTimestamp as any);
        Alert.alert("Success", "Geofence created.");
      }
      router.back();
    } catch (error: any) {
      console.error("Error saving geofence:", error);
      Alert.alert("Error Saving Geofence", `Could not save geofence. ${error.message || '(Check console logs.)'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
     if (!isAdmin || isCreating || !actualGeofenceId) return;
     Alert.alert("Confirm Deletion", `Delete "${name || 'this geofence'}"?`, [
         { text: "Cancel", style: "cancel" },
         { text: "Delete", style: "destructive", onPress: async () => {
                 setIsDeleting(true);
                 try {
                     await deleteDoc(doc(firestore, 'geofences', actualGeofenceId));
                     Alert.alert("Deleted", `Geofence "${name}" removed.`); router.back();
                 } catch (error) { Alert.alert("Error", "Could not delete geofence."); setIsDeleting(false); }
             }
         }
     ]);
  };

  if (isLoading) { return <ThemedView style={styles.centered}><ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint}/></ThemedView>; }
  if (!initialRegion && isCreating) { return <ThemedView style={styles.centered}><ThemedText>Fetching initial location for map...</ThemedText></ThemedView>; }
  if (!initialRegion && !isCreating) { return <ThemedView style={styles.centered}><ThemedText>Error loading map region.</ThemedText></ThemedView>; }


  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: isCreating ? 'Create New Geofence' : `Edit "${name || 'Geofence'}"` }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingContainer}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0} // Adjust this value as needed
      >
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContentContainer}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.formSection}>
                <ThemedText style={styles.label}>Geofence Name</ThemedText>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Home, School, Work"
                    placeholderTextColor={Colors[colorScheme ?? 'light'].icon + 'A0'}
                    editable={isAdmin}
                    maxLength={50}
                />

                <ThemedText style={styles.label}>Radius (meters): {Math.round(radius)}m</ThemedText>
                <TextInput
                    style={styles.input}
                    value={String(Math.round(radius))}
                    onChangeText={(text) => {
                        const num = parseInt(text, 10);
                        if (!isNaN(num)) setRadius(Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, num)));
                        else if (text === '') setRadius(0);
                    }}
                    placeholder={`Range: ${MIN_RADIUS} - ${MAX_RADIUS}m`}
                    keyboardType="numeric"
                    placeholderTextColor={Colors[colorScheme ?? 'light'].icon + 'A0'}
                    editable={isAdmin}
                />
            </View>

            <View style={styles.mapSection}>
                <ThemedText style={styles.mapLabel}>Tap on the map to set the center</ThemedText>
                <View style={styles.mapContainer}>
                {initialRegion && ( // Only render MapView if initialRegion is ready
                    <MapView
                        ref={mapRef}
                        style={styles.map}
                        initialRegion={initialRegion}
                        // Control region if center is explicitly set by user tap
                        region={center ? {
                            ...center,
                            latitudeDelta: 0.022 * (Math.max(radius, MIN_RADIUS) / 400),
                            longitudeDelta: 0.012 * (Math.max(radius, MIN_RADIUS) / 400),
                        } : initialRegion}
                        onRegionChangeComplete={(newRegion, details) => {
                            // Update initialRegion if user pans/zooms AND no center is set by tap yet
                            // This prevents map from snapping back if user pans before tapping
                            if (!center && details?.isGesture) {
                                setInitialRegion(newRegion);
                            }
                        }}
                        onPress={handleMapPress}
                        showsUserLocation
                        showsMyLocationButton={true}
                        pitchEnabled={false} // Simpler map interaction
                        rotateEnabled={false}
                    >
                        {center && (
                        <>
                            <Marker
                                coordinate={center}
                                pinColor={Colors[colorScheme ?? 'light'].tint}
                                title={name || "Geofence Center"}
                                description={`Radius: ${Math.round(radius)}m`}
                            />
                            <Circle
                                center={center}
                                radius={radius}
                                strokeColor={GEOFENCE_COLORS[colorScheme ?? 'light'].stroke}
                                fillColor={GEOFENCE_COLORS[colorScheme ?? 'light'].fill}
                                strokeWidth={2}
                            />
                        </>
                        )}
                    </MapView>
                )}
                </View>
            </View>

            {isAdmin && (
                <View style={styles.actionButtonsContainer}>
                    <Pressable
                        style={({pressed}) => [styles.actionButton, styles.saveButton, (isSaving || isDeleting || !center || !name.trim() || radius < MIN_RADIUS || radius > MAX_RADIUS) && styles.buttonDisabled, pressed && styles.buttonPressed]}
                        onPress={handleSave}
                        disabled={isSaving || isDeleting || !center || !name.trim() || radius < MIN_RADIUS || radius > MAX_RADIUS}
                    >
                        {isSaving ? <ActivityIndicator color="#fff" style={styles.buttonIcon}/> : <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" style={styles.buttonIcon}/>}
                        <Text style={styles.actionButtonText}>{isSaving ? "Saving..." : "Save"}</Text>
                    </Pressable>
                    {!isCreating && (
                        <Pressable
                            style={({pressed}) => [styles.actionButton, styles.deleteButton, (isSaving || isDeleting) && styles.buttonDisabled, pressed && styles.buttonPressed]}
                            onPress={handleDelete}
                            disabled={isSaving || isDeleting}
                        >
                             {isDeleting ? <ActivityIndicator color="#fff" style={styles.buttonIcon}/> : <IconSymbol name="trash.fill" size={20} color="#fff" style={styles.buttonIcon}/>}
                            <Text style={styles.actionButtonText}>{isDeleting ? "Deleting..." : "Delete"}</Text>
                        </Pressable>
                    )}
                </View>
            )}
            {!isAdmin && !isCreating && (<ThemedText style={styles.adminNote}>Only admins can edit or delete geofences.</ThemedText>)}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = (colorScheme: 'light' | 'dark' | null | undefined) => {
    const currentScheme = colorScheme ?? 'light';
    const themeColors = Colors[currentScheme];
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: themeColors.background },
        keyboardAvoidingContainer: { flex: 1 },
        scrollView: { flex: 1, }, // Ensure ScrollView can take space
        scrollContentContainer: {
            paddingBottom: 50, // Space for buttons at the end
            paddingHorizontal: 20, // Horizontal padding for content
            paddingTop: 10, // Space from header
        },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background },
        formSection: {
            marginBottom: 25, // Space between form sections
        },
        label: {
            fontSize: 15, // Slightly smaller, more conventional label size
            fontWeight: '600',
            marginBottom: 8,
            color: themeColors.text,
        },
        input: {
            height: 50,
            borderColor: themeColors.icon + '80',
            borderWidth: 1,
            borderRadius: 10, // Consistent border radius
            marginBottom: 20, // Increased space after input
            paddingHorizontal: 15,
            fontSize: 16,
            color: themeColors.text,
            backgroundColor: currentScheme === 'light' ? '#FFFFFF' : '#2C2C2E',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
        },
        mapSection: {
            marginBottom: 20, // Space after map section
        },
        mapLabel: {
            fontSize: 14,
            color: themeColors.icon,
            marginBottom: 10,
            textAlign: 'center',
            fontStyle: 'italic',
        },
        mapContainer: {
            width: '100%',
            height: 350, // Increased map height
            borderRadius: 10,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: themeColors.icon + '50',
        },
        map: { flex: 1, },
        actionButtonsContainer: {
            marginTop: 10,
            marginBottom: 30,
        },
        actionButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderRadius: 10,
            marginBottom: 12,
            minHeight: 50,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 3,
            elevation: 3,
        },
        saveButton: {
            backgroundColor: themeColors.tint,
        },
        deleteButton: {
            backgroundColor: '#DC3545', // Bootstrap danger red
        },
        buttonPressed: {
            opacity: 0.8,
        },
        buttonDisabled: {
            opacity: 0.6,
            backgroundColor: themeColors.icon,
        },
        actionButtonText: {
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: '600',
        },
        buttonIcon: {
            marginRight: 10, // Space between icon and text
        },
        adminNote: {
            textAlign: 'center',
            marginTop: 15,
            paddingHorizontal: 20,
            fontStyle: 'italic',
            color: themeColors.icon,
            marginBottom: 20,
        },
    });
};
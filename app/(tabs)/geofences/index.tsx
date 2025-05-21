// app/geofences/index.tsx

import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform } from 'react-native'; // Added Platform
import { useRouter, Href } from 'expo-router';
import { collection, query, where, onSnapshot, Unsubscribe, GeoPoint } from 'firebase/firestore'; // Added GeoPoint

import { firestore } from '@/config/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
// Assuming Geofence type is defined in types or adjust import
// For this example, let's define it here if not imported from a central place
interface Geofence {
  id: string;
  name: string;
  center: { latitude: number; longitude: number; };
  radius: number;
  familyId?: string;
}
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function GeofenceListScreen() {
  const router = useRouter();
  const { user, currentUserProfile } = useAuth();
  const colorScheme = useColorScheme();
  const styles = createStyles(colorScheme);

  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(currentUserProfile?.role === 'admin');
  }, [currentUserProfile]);

  useEffect(() => {
    if (!user || !currentUserProfile?.familyId) {
      setGeofences([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const familyId = currentUserProfile.familyId;
    const q = query(collection(firestore, 'geofences'), where('familyId', '==', familyId));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fences: Geofence[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const centerGeoPoint = data.center as GeoPoint; // Cast from Firestore GeoPoint
        if (centerGeoPoint?.latitude && centerGeoPoint?.longitude && typeof data.radius === 'number') {
            fences.push({
                id: doc.id, name: data.name || 'Unnamed Zone',
                center: { latitude: centerGeoPoint.latitude, longitude: centerGeoPoint.longitude, },
                radius: data.radius, familyId: data.familyId,
            });
        }
      });
      setGeofences(fences);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching geofences: ", error);
      Alert.alert("Error", "Could not load geofences.");
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentUserProfile?.familyId]);

  const handleAddPress = () => {
    const href: Href = { pathname: '/geofences/[geofenceId]', params: { geofenceId: 'new' } };
    router.push(href);
  };

  const handleItemPress = (geofenceId: string) => {
    const href: Href = { pathname: '/geofences/[geofenceId]', params: { geofenceId: geofenceId } };
    router.push(href);
  };

  const renderItem = ({ item }: { item: Geofence }) => (
    <TouchableOpacity onPress={() => handleItemPress(item.id)} style={styles.itemTouchable}>
      <ThemedView style={styles.itemContainer}>
        <IconSymbol name="mappin.and.ellipse" size={24} color={Colors[colorScheme ?? 'light'].text} style={styles.itemIcon} />
        <View style={styles.itemTextContainer}>
            <ThemedText style={styles.itemName}>{item.name}</ThemedText>
            <ThemedText style={styles.itemRadius}>Radius: {item.radius}m</ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={18} color={Colors[colorScheme ?? 'light'].icon} />
      </ThemedView>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
         <ThemedText type="title" style={styles.title}>Manage Geofences</ThemedText>

         {isLoading ? (
           <View style={styles.loaderContainer}><ActivityIndicator size="large" /></View>
         ) : (
           <FlatList
             data={geofences}
             renderItem={renderItem}
             keyExtractor={(item) => item.id}
             ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <IconSymbol name="shield.slash" size={48} color={Colors[colorScheme ?? 'light'].icon + '80'} />
                    <ThemedText style={styles.emptyText}>No geofences created yet.</ThemedText>
                    {!isAdmin && <ThemedText style={styles.emptySubText}>Contact an admin to add geofences.</ThemedText>}
                </View>
             }
             contentContainerStyle={styles.listContent}
           />
         )}

         {/* Show Add button only for admins - positioned as FAB */}
         {isAdmin && (
           <TouchableOpacity style={styles.fab} onPress={handleAddPress} activeOpacity={0.8}>
               <IconSymbol name="plus" size={26} color={'#FFFFFF'} />
           </TouchableOpacity>
         )}
      </ThemedView>
    </SafeAreaView>
  );
}

const createStyles = (colorScheme: 'light' | 'dark' | null | undefined) => {
    const themeColors = Colors[colorScheme ?? 'light'];
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: themeColors.background },
        container: { flex: 1, },
        title: {
            fontSize: 26,
            fontWeight: 'bold',
            paddingHorizontal: 20,
            paddingTop: 20, // Space from safe area top
            paddingBottom: 10, // Space before list
            color: themeColors.text,
            // borderBottomWidth: StyleSheet.hairlineWidth, // Optional separator
            // borderBottomColor: themeColors.icon + '30',
        },
        loaderContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        listContent: {
            paddingHorizontal: 10, // Add some horizontal padding to the list items
            paddingBottom: 80, // Ensure enough space at the bottom FOR THE LIST CONTENT if FAB wasn't there
            flexGrow: 1, // Important for ListEmptyComponent to center
        },
        itemTouchable: {
            marginHorizontal: 10, // For consistent spacing if listContent has no padding
            borderRadius: 10, // Rounded corners for items
            marginBottom: 10, // Space between items
        },
        itemContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 18,
            paddingHorizontal: 15,
            backgroundColor: themeColors.background, // Or a card-like background
            borderRadius: 10,
            // Optional: Add shadow for card effect
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1, },
            shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.08,
            shadowRadius: 2,
            elevation: 2,
        },
        itemIcon: {
            marginRight: 18,
        },
        itemTextContainer: {
            flex: 1,
        },
        itemName: {
            fontSize: 17,
            fontWeight: '500',
            color: themeColors.text,
        },
        itemRadius: {
            fontSize: 13,
            color: themeColors.icon,
            marginTop: 2,
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
        },
        emptyText: {
            textAlign: 'center',
            marginTop: 15,
            fontSize: 17,
            color: themeColors.icon,
        },
        emptySubText: {
            textAlign: 'center',
            marginTop: 5,
            fontSize: 14,
            color: themeColors.icon + 'B0', // Lighter subtext
        },
        fab: { // Floating Action Button style
            position: 'absolute',
            right: 25,
            bottom: Platform.OS === 'ios' ? 80 : 70,
            // *** USE THE NEW THEME COLOR FOR BACKGROUND ***
            backgroundColor: themeColors.fabBackground,
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 6, // Android shadow
            shadowColor: '#000', // iOS shadow
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 3,
        },
        // addButtonText is removed as we are using an Icon for FAB
    });
};
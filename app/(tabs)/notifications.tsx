// src/app/(tabs)/notifications.tsx

import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, FlatList, SafeAreaView, ActivityIndicator, Alert, RefreshControl, TouchableOpacity } from 'react-native'; // Added TouchableOpacity, RefreshControl, ActivityIndicator, Alert
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol, IconSymbolName } from '@/components/ui/IconSymbol';
import { useAuth } from '@/context/AuthContext';
import { firestore } from '@/config/firebaseConfig';
import {
    collection, query, where, orderBy, limit, onSnapshot,
    doc, updateDoc, Timestamp, // Import Timestamp
    Unsubscribe // Import Unsubscribe
} from 'firebase/firestore';

// Define Notification Type based on Firestore structure
interface AppNotification {
  id: string; // Firestore document ID
  recipientUid: string;
  familyId: string;
  type: 'sos' | 'low_battery' | 'geofence_entry' | 'geofence_exit' | 'info'; // Add more types if needed
  title: string;
  message: string;
  timestamp: Timestamp; // Firestore Timestamp
  read: boolean;
  triggeringUid?: string;
  relatedGeofenceId?: string;
  // relatedLocation?: GeoPoint; // Not typically displayed directly in list
}

export default function NotificationsScreen() {
  const colorScheme = useColorScheme();
  const styles = createStyles(colorScheme);
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const listenerRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    // Cleanup previous listener if user changes or logs out
    listenerRef.current?.();
    listenerRef.current = null;
    setNotifications([]); // Clear notifications on user change

    if (!user) {
      console.log("Notifications: No user logged in.");
      setIsLoading(false);
      return; // Exit if no user
    }

    console.log("Notifications: Setting up listener for user:", user.uid);
    setIsLoading(true);

    // Query notifications for the current user, ordered by time descending
    const notificationsQuery = query(
      collection(firestore, 'notifications'),
      where('recipientUid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50) // Limit results
    );

    // Set up the listener
    listenerRef.current = onSnapshot(notificationsQuery, (querySnapshot) => {
      console.log(`Notifications: Snapshot received (${querySnapshot.size} docs).`);
      const fetchedNotifications: AppNotification[] = [];
      querySnapshot.forEach((doc) => {
        // Basic validation (optional but good practice)
        const data = doc.data();
        if (data.recipientUid && data.type && data.title && data.message && data.timestamp) {
            fetchedNotifications.push({ id: doc.id, ...data } as AppNotification);
        } else {
            console.warn("Skipping malformed notification document:", doc.id);
        }
      });
      setNotifications(fetchedNotifications);
      setIsLoading(false);
      setIsRefreshing(false);
      // Optional: Mark new notifications as read automatically?
      // const unread = fetchedNotifications.filter(n => !n.read);
      // if (unread.length > 0) markNotificationsAsRead(unread.map(n => n.id));

    }, (error) => {
      console.error("Notifications: Error fetching notifications: ", error);
      Alert.alert("Error", "Could not load notifications.");
      setIsLoading(false);
      setIsRefreshing(false);
    });

    // Cleanup listener on unmount
    return () => {
      console.log("Notifications: Cleaning up listener.");
      listenerRef.current?.();
      listenerRef.current = null;
    };
  }, [user]); // Rerun only when user changes

  // Function to mark a single notification as read in Firestore
  const handleMarkAsRead = async (notificationId: string) => {
      console.log("Marking notification as read:", notificationId);
      try {
          const notifRef = doc(firestore, 'notifications', notificationId);
          await updateDoc(notifRef, { read: true });
          // UI updates automatically via the snapshot listener
      } catch (error) {
          console.error("Error marking notification as read:", error);
      }
  };

  // Function for pull-to-refresh
  const onRefresh = () => {
      // The listener should automatically refresh data, but we manage the indicator
      // No direct re-fetch needed unless the listener failed previously.
      console.log("Notifications: Refresh triggered.");
      setIsRefreshing(true);
      // If listener failed, you might want to re-initiate it here,
      // but typically onSnapshot handles retries/updates.
      // Setting refreshing false is handled when the snapshot listener updates.
  };

  // Function to get icon based on notification type
  const getIconForType = (type: AppNotification['type']): { name: IconSymbolName; color: string } => {
    const tint = Colors[colorScheme ?? 'light'].tint;
    const iconColor = Colors[colorScheme ?? 'light'].icon;
    switch (type) {
      case 'sos': return { name: 'exclamationmark.triangle.fill', color: '#E74C3C' }; // Use specific color
      case 'low_battery': return { name: 'battery.25', color: '#F39C12' }; // Use specific color
      case 'geofence_entry': return { name: 'figure.walk.arrival', color: tint };
      case 'geofence_exit': return { name: 'figure.walk.departure', color: iconColor };
      case 'info': return { name: 'info.circle.fill', color: iconColor };
      default: return { name: 'bell.fill', color: iconColor };
    }
  };

  // Render individual notification item
  const renderNotification = ({ item }: { item: AppNotification }) => {
    const iconInfo = getIconForType(item.type);
    // Convert Firestore Timestamp to JS Date for display
    const displayDate = item.timestamp?.toDate(); // Use optional chaining
    const displayTimestamp = displayDate
        ? `${displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${displayDate.toLocaleDateString()}`
        : 'Unknown time';

    return (
      // Wrap with TouchableOpacity to mark as read on press (only if unread)
      <TouchableOpacity
        onPress={() => !item.read && handleMarkAsRead(item.id)}
        disabled={item.read} // Disable press if already read
        activeOpacity={item.read ? 1 : 0.7} // Less feedback if read
      >
        <ThemedView style={[styles.notificationItem, !item.read && styles.unreadItem]}>
          <IconSymbol name={iconInfo.name} color={iconInfo.color} size={24} style={styles.icon} />
          <View style={styles.notificationContent}>
            <ThemedText style={styles.notificationTitle}>{item.title}</ThemedText>
            <ThemedText style={styles.notificationMessage}>{item.message}</ThemedText>
            <ThemedText style={styles.timestamp}>{displayTimestamp}</ThemedText>
          </View>
          {/* Show dot only if unread */}
          {!item.read && <View style={styles.unreadDot} />}
        </ThemedView>
      </TouchableOpacity>
    );
  };

  // Main Render
  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Notifications</ThemedText>
        {/* Show loading indicator only when fetching initially and list is empty */}
        {isLoading && notifications.length === 0 ? (
             <View style={styles.centered}>
               <ActivityIndicator size="large" />
               <ThemedText style={{marginTop: 10}}>Loading notifications...</ThemedText>
             </View>
        ) : (
            <FlatList
              data={notifications}
              renderItem={renderNotification}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContentContainer}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <ThemedText style={styles.emptyText}>No notifications yet.</ThemedText>
                </View>
              }
              refreshControl={ // Add pull-to-refresh
                  <RefreshControl
                      refreshing={isRefreshing}
                      onRefresh={onRefresh}
                      tintColor={Colors[colorScheme ?? 'light'].text} // Match text color
                  />
              }
            />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

// Styles (Keep or adjust as needed)
const createStyles = (colorScheme: 'light' | 'dark' | null | undefined) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors[colorScheme ?? 'light'].background },
  container: { flex: 1 }, // Removed paddingTop, title handles it
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, // Centered for loading/empty
  title: { fontSize: 24, fontWeight: 'bold', marginVertical: 20, paddingHorizontal: 16, color: Colors[colorScheme ?? 'light'].text },
  listContentContainer: { paddingHorizontal: 16, paddingBottom: 20 },
  notificationItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: Colors[colorScheme ?? 'light'].background, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors[colorScheme ?? 'light'].icon + '50', // Lighter border
  },
  unreadItem: {
     backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f8f8ff', // Subtle background for unread
     borderColor: Colors[colorScheme ?? 'light'].tint, // Tint border for unread
     borderWidth: 1.5, // Slightly thicker border for unread
  },
  icon: { marginRight: 15, width: 24, // Ensure icon has fixed width
  },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 3, color: Colors[colorScheme ?? 'light'].text },
  notificationMessage: { fontSize: 14, marginBottom: 5, color: Colors[colorScheme ?? 'light'].text, lineHeight: 18 },
  timestamp: { fontSize: 12, color: Colors[colorScheme ?? 'light'].icon },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors[colorScheme ?? 'light'].tint, marginLeft: 10, alignSelf: 'center' },
  emptyText: { textAlign: 'center', fontSize: 16, color: Colors[colorScheme ?? 'light'].icon },
});
import React, { useState, useEffect } from 'react';
import {
    StyleSheet, View, Switch, SafeAreaView, ScrollView,
    Alert, Pressable, Text, ActivityIndicator // Added Text, ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol, IconSymbolName } from '@/components/ui/IconSymbol'; // Import IconSymbolName if using
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, remove } from 'firebase/database';
import { firestore, database } from '@/config/firebaseConfig';

// --- Component ---
export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const { logout, user, currentUserProfile } = useAuth();
  const styles = useStyles(colorScheme); // Pass scheme to dynamic styles
  const router = useRouter();

  // State for switches
  const [isLocationSharingEnabled, setIsLocationSharingEnabled] = useState(
      () => currentUserProfile?.settings?.shareLocation ?? true
  );
  const [isBatteryAlertsEnabled, setIsBatteryAlertsEnabled] = useState(
      () => currentUserProfile?.settings?.batteryAlerts ?? true
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false); // Loading state for logout

  // Effect to sync local state with profile
  useEffect(() => {
    setIsLocationSharingEnabled(currentUserProfile?.settings?.shareLocation ?? true);
    setIsBatteryAlertsEnabled(currentUserProfile?.settings?.batteryAlerts ?? true);
  }, [currentUserProfile]);


  // Helper to update Firestore
  const updateFirestoreSetting = async (key: 'shareLocation' | 'batteryAlerts', value: boolean) => {
    if (!user) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, { [`settings.${key}`]: value });
      console.log(`Setting '${key}' updated to ${value} in Firestore.`);
    } catch (error) {
      console.error(`Failed to update setting '${key}':`, error);
      Alert.alert("Error", "Could not save setting preference.");
      if (key === 'shareLocation') setIsLocationSharingEnabled(!value);
      if (key === 'batteryAlerts') setIsBatteryAlertsEnabled(!value);
    }
  };

  // Toggle Location Sharing
  const toggleLocationSharing = () => {
    if (!user) return;
    const newValue = !isLocationSharingEnabled;
    setIsLocationSharingEnabled(newValue);
    updateFirestoreSetting('shareLocation', newValue);
    if (!newValue) {
      console.log("Clearing RTDB location due to sharing disabled.");
      const locationRef = ref(database, `liveData/${user.uid}/currentLocation`);
      remove(locationRef).catch(err => console.error("Failed to clear RTDB location:", err));
    }
  };

  // Toggle Battery Alerts
  const toggleBatteryAlerts = () => {
    const newValue = !isBatteryAlertsEnabled;
    setIsBatteryAlertsEnabled(newValue);
    updateFirestoreSetting('batteryAlerts', newValue);
  };

  // Navigation
  const goToGeofences = () => { router.push('/geofences'); };

  // Logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      console.log("Logout initiated.");
      // Navigation away is handled by root layout effect
    } catch (error: any) {
      console.error("Logout error:", error);
      Alert.alert("Logout Failed", error.message || "Could not log out.");
      setIsLoggingOut(false); // Reset loading on error
    }
    // No finally needed as navigation will unmount
  };

  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const isInFamily = !!currentUserProfile?.familyId;

  // Helper to render a setting item (reduces repetition)
  const SettingItem = ({
    label,
    iconName,
    value,
    onValueChange,
    disabled = false,
    isSwitch = true,
    onPress,
  }: {
    label: string;
    iconName: IconSymbolName; // Ensure IconSymbolName is exported from IconSymbol
    value?: boolean;
    onValueChange?: (val: boolean) => void;
    disabled?: boolean;
    isSwitch?: boolean;
    onPress?: () => void;
  }) => (
    <Pressable onPress={onPress} disabled={disabled || !onPress && isSwitch}>
      {({ pressed }) => (
        <ThemedView style={[styles.settingItem, disabled && styles.disabledItem, pressed && onPress && styles.pressedItem]}>
          <IconSymbol name={iconName} color={disabled ? Colors[colorScheme??'light'].icon + '80' : Colors[colorScheme??'light'].icon} size={22} style={styles.icon} />
          <ThemedText style={[styles.settingText, disabled && styles.disabledText]}>{label}</ThemedText>
          {isSwitch && onValueChange !== undefined && value !== undefined ? (
            <Switch
              trackColor={{ false: '#767577', true: tintColor }}
              thumbColor={'#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
              onValueChange={onValueChange}
              value={value}
              disabled={disabled}
            />
          ) : (
            !isSwitch && onPress && <IconSymbol name="chevron.right" size={16} color={disabled ? Colors[colorScheme??'light'].icon + '80' : Colors[colorScheme??'light'].icon} />
          )}
        </ThemedView>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContentContainer}>
        <ThemedText type="title" style={styles.title}>Settings</ThemedText>

        {/* --- General Settings Section --- */}
        <ThemedText style={styles.sectionHeader}>General</ThemedText>
        <SettingItem
            label="Share My Location"
            iconName="location.fill"
            value={isLocationSharingEnabled}
            onValueChange={toggleLocationSharing}
        />
        {/* If you had a push notification toggle: */}
        {/* <SettingItem label="Push Notifications" iconName="bell.fill" value={...} onValueChange={...} /> */}


        {/* --- Family Settings Section --- */}
        {isInFamily && ( // Only show this section if in a family
            <>
                <ThemedText style={styles.sectionHeader}>Family</ThemedText>
                <SettingItem
                    label="Low Battery Alerts (Family)"
                    iconName="battery.25"
                    value={isBatteryAlertsEnabled}
                    onValueChange={toggleBatteryAlerts}
                    disabled={!isInFamily}
                />
                <SettingItem
                    label="Manage Geofences"
                    iconName="mappin.and.ellipse"
                    onPress={goToGeofences}
                    disabled={!isInFamily}
                    isSwitch={false} // This indicates it's a navigation item
                />
            </>
        )}
        {!isInFamily && (
             <ThemedText style={styles.noteText}>Join or create a family to access family-specific settings like geofences and battery alerts.</ThemedText>
        )}


        {/* --- Account Section --- */}
        <ThemedText style={styles.sectionHeader}>Account</ThemedText>
        <Pressable
            style={({ pressed }) => [styles.logoutButton, isLoggingOut && styles.buttonDisabled, pressed && styles.pressedItem]}
            onPress={handleLogout}
            disabled={isLoggingOut}
        >
            {isLoggingOut ? (
                <ActivityIndicator size="small" color={styles.logoutButtonText.color} />
            ) : (
                <Text style={styles.logoutButtonText}>Logout</Text>
            )}
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// --- Dynamic Styles ---
const useStyles = (colorScheme: 'light' | 'dark' | null | undefined) => {
    const currentScheme = colorScheme ?? 'light';
    const themeColors = Colors[currentScheme];

    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: themeColors.background },
        container: { flex: 1 },
        scrollContentContainer: { paddingBottom: 30 }, // Ensure space at the bottom
        title: { fontSize: 30, fontWeight: 'bold', marginTop: 20, marginBottom: 20, paddingHorizontal: 16, color: themeColors.text, textAlign: 'center' },
        sectionHeader: {
            fontSize: 14,
            fontWeight: '600',
            color: themeColors.icon, // Muted color for section headers
            paddingHorizontal: 16,
            marginTop: 25, // Space above section header
            marginBottom: 8, // Space below section header
            textTransform: 'uppercase', // Optional: make headers uppercase
        },
        settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: themeColors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.icon + '30', // Very subtle separator
                         minHeight: 50, // Good touch target height
        },
        icon: { marginRight: 16, width: 22, // Ensure consistent icon width for alignment
        },
        settingText: { flex: 1, fontSize: 16, color: themeColors.text, },
        disabledItem: { opacity: 0.6, },
        disabledText: { color: themeColors.icon, },
        pressedItem: { backgroundColor: themeColors.icon + '10', },
        noteText: { fontSize: 13, color: themeColors.icon, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 15, textAlign: 'left', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.icon + '30', },
        logoutButton: {
            backgroundColor: currentScheme === 'light' ? '#FF3B30' : '#FF453A', // iOS destructive red
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginHorizontal: 16, // Align with other content padding
            marginTop: 30,
            minHeight: 50,
        },
        logoutButtonText: {
            color: '#FFFFFF', // White text on red button
            fontSize: 16,
            fontWeight: '600',
        },
        buttonDisabled: { // Used for logout button when loading
            backgroundColor: currentScheme === 'light' ? '#FF3B30' + '80' : '#FF453A' + '80', // Faded red
        },
    });
};
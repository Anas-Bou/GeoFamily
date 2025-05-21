import React, { useState } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import MapView, { Marker, Circle, Region, Callout } from 'react-native-maps';
import { FamilyMember, Geofence } from '../app/(tabs)/index'; // *** ADJUST PATH IF NEEDED ***
import { Colors } from '@/constants/Colors';
import { ThemedText } from '@/components/ThemedText';

// Define props for the wrapper component
interface MapViewWrapperProps {
  mapRegion: Region;
  setMapRegion: (region: Region) => void;
  currentUserId?: string;
  familyMembers: FamilyMember[];
  geofences: Geofence[];
  colorScheme: 'light' | 'dark';
}

// --- Styles ---
// REMOVE geofence colors from here
const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  avatarMarkerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  markerContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#CCCCCC',
  },
  defaultMarkerContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultMarkerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  calloutView: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'white',
    minWidth: 120,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
    color: '#333333',
  },
  calloutText: {
    fontSize: 12,
    color: '#555555',
  },
  // Geofence color styles REMOVED from StyleSheet.create
  // geofenceStrokeColorLight: 'rgba(0, 150, 255, 0.5)', <-- REMOVE
  // geofenceFillColorLight: 'rgba(0, 150, 255, 0.2)',   <-- REMOVE
  // geofenceStrokeColorDark: 'rgba(100, 200, 255, 0.6)',<-- REMOVE
  // geofenceFillColorDark: 'rgba(100, 200, 255, 0.3)',  <-- REMOVE
});

// --- Define colors outside StyleSheet ---
const GEOFENCE_COLORS = {
  light: {
    stroke: 'rgba(0, 150, 255, 0.5)',
    fill: 'rgba(0, 150, 255, 0.2)',
  },
  dark: {
    stroke: 'rgba(100, 200, 255, 0.6)',
    fill: 'rgba(100, 200, 255, 0.3)',
  },
};


const MapViewWrapper: React.FC<MapViewWrapperProps> = ({
  mapRegion,
  setMapRegion,
  familyMembers,
  geofences,
  colorScheme = 'light',
  currentUserId,
}) => {
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);

  const renderFamilyMemberMarker = (member: FamilyMember) => {
    const latitude = member.currentLocation?.latitude;
    const longitude = member.currentLocation?.longitude;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    const isCurrentUserDevice = member.id === currentUserId;
    const coordinate = { latitude, longitude };

    const batteryValue = member.batteryLevel;
    const displayBattery = (typeof batteryValue === 'number' && batteryValue >= 0)
        ? `${batteryValue}%`
        : 'N/A';

    const markerBorderColor = isCurrentUserDevice ? Colors[colorScheme].tint : 'white';
    const defaultMarkerBackgroundColor = isCurrentUserDevice ? Colors[colorScheme].tint : '#888';

    return (
      <Marker
        key={member.id}
        coordinate={coordinate}
        onPress={() => setSelectedMember(member)}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        {member.avatarUrl ? (
          <View style={[styles.markerContainer, { borderColor: markerBorderColor }]}>
            <Image source={{ uri: member.avatarUrl }} style={styles.avatarMarkerImage} />
          </View>
        ) : (
          <View style={[styles.defaultMarkerContainer, { borderColor: markerBorderColor, backgroundColor: defaultMarkerBackgroundColor }]}>
            <View style={[styles.defaultMarkerDot, { backgroundColor: 'white' }]} />
          </View>
        )}
        <Callout tooltip={false}>
          <View style={styles.calloutView}>
            <Text style={styles.calloutTitle}>{member.name ?? 'Unknown'}{isCurrentUserDevice ? ' (You)' : ''}</Text>
            <Text style={styles.calloutText}>Battery: {displayBattery}</Text>
            {member.currentLocation?.timestamp && typeof member.currentLocation.timestamp === 'number' &&
              <Text style={styles.calloutText}>
                Last seen: {new Date(member.currentLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            }
          </View>
        </Callout>
      </Marker>
    );
  };

  const renderGeofenceCircle = (geofence: Geofence) => {
    // Use the colors directly based on the colorScheme prop
    const strokeColor = GEOFENCE_COLORS[colorScheme].stroke;
    const fillColor = GEOFENCE_COLORS[colorScheme].fill;

    return (
      <Circle
        key={geofence.id}
        center={geofence.center}
        radius={geofence.radius}
        strokeColor={strokeColor} // Use the string literal directly
        fillColor={fillColor}     // Use the string literal directly
        strokeWidth={1}
      />
    );
  };

  return (
    <MapView
      style={styles.map}
      provider={undefined}
      region={mapRegion}
      onRegionChangeComplete={setMapRegion}
      showsUserLocation={false}
      showsMyLocationButton={true}
      showsPointsOfInterest={false}
      showsCompass={true}
    >
      {familyMembers.map(renderFamilyMemberMarker)}
      {geofences.map(renderGeofenceCircle)}
    </MapView>
  );
};

export default MapViewWrapper;
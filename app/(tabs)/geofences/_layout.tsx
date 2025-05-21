// app/geofences/_layout.tsx
import { Stack } from 'expo-router';
import React from 'react';

export default function GeofenceLayout() {
  return (
    <Stack screenOptions={{
      // Optional: Default header styling for this stack
    }}>
      <Stack.Screen
        name="index" // This refers to app/geofences/index.tsx
        options={{ title: 'Manage Geofences' }}
      />
      <Stack.Screen
        name="[geofenceId]" // This refers to app/geofences/[geofenceId].tsx
        // Title can be set dynamically in the screen component using router.setOptions
        options={{ title: 'Edit Geofence', headerBackTitle: 'List' }}
      />
      {/* Add screen for Create if needed separately, or handle within [geofenceId] */}
       <Stack.Screen
         name="create" // Path would be /geofences/create
         options={{ title: 'Create Geofence', headerBackTitle: 'List', presentation: 'modal' }} // Example: Create as modal
       />
    </Stack>
  );
}
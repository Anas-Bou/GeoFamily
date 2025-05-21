// Example: src/navigation/types.ts OR where your navigator is defined

// Define the parameters each screen in the Geofence stack expects.
// Use `undefined` if a screen takes no parameters.
export type GeofenceStackParamList = {
    GeofenceList: undefined; // The list screen doesn't need any params when navigated TO.
    GeofenceEdit: { geofenceId?: string }; // The edit screen takes an OPTIONAL geofenceId string.
                                          // It's optional because when creating NEW, no ID is passed.
    // Add other screens in this specific stack here if any
  };
  
  // You might also define the navigation prop type for convenience
  import { StackNavigationProp } from '@react-navigation/stack';
  export type GeofenceNavigationProp = StackNavigationProp<GeofenceStackParamList>;
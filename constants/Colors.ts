// constants/Colors.ts

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // --- ADD FAB COLORS FOR LIGHT MODE ---
    fabBackground: '#007AFF', // Example: iOS Blue (or your app's primary action color)
    fabIcon: '#FFFFFF',       // White icon on blue background
    error: '#D9534F', // Example: A common red for errors

  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // --- ADD FAB COLORS FOR DARK MODE ---
    fabBackground: '#0A84FF', // Example: Slightly brighter blue for dark mode
    fabIcon: '#FFFFFF',    
    error: '#FF6B6B', // Example: A lighter red for dark mode
   // White icon
  },
};
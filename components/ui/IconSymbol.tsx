// This file is a fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import React from 'react';
import { OpaqueColorValue, StyleProp, TextStyle, ViewStyle } from 'react-native'; // Import TextStyle

// Add your SFSymbol to MaterialIcons mappings here.
const MAPPING = {
  // See MaterialIcons here: https://icons.expo.fyi
  // See SF Symbols in the SF Symbols app on Mac.
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  // Added mappings for notification icons:
  'bell.fill': 'notifications',
  'exclamationmark.triangle.fill': 'warning',
  'battery.25': 'battery-alert', // Using battery-alert as a close equivalent
  'figure.walk.arrival': 'login', // Using login to represent entry
  'figure.walk.departure': 'logout', // Using logout to represent exit
  // Added mappings for other new tab icons:
  'clock.fill': 'history',
  'gearshape.fill': 'settings',
  // Added mapping for map icon:
  'map.fill': 'map',
  // Added mapping for family icon:
  'person.2.fill': 'people',
} as Partial<
  Record<
    import('expo-symbols').SymbolViewProps['name'],
    React.ComponentProps<typeof MaterialIcons>['name']
  >
>;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web. This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>; // Change ViewStyle to TextStyle
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

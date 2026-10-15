import React, { ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

export interface AppCardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'none';
  accessibilityLabel?: string;
  testID?: string;
  variant?: 'default' | 'heroNavy';
  noPadding?: boolean;
}

export function AppCard({
  children,
  style,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  testID,
  variant = 'default',
  noPadding = false,
}: AppCardProps) {
  const isHero = variant === 'heroNavy';

  const cardStyle: ViewStyle = isHero
    ? {
        backgroundColor: '#062B55',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        shadowColor: '#062B55',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 4,
      }
    : {
        backgroundColor: '#FFFFFF',
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      };

  const combinedStyle = [
    styles.base,
    cardStyle,
    noPadding && styles.noPadding,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          combinedStyle,
          pressed && styles.pressed,
        ]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={combinedStyle}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  noPadding: {
    padding: 0,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
});

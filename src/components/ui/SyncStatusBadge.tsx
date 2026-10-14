import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import { syncNow, useSyncStatus } from '@/lib/sync-service';

interface SyncStatusBadgeProps {
  compact?: boolean;
}

export function SyncStatusBadge({ compact = false }: SyncStatusBadgeProps) {
  const { isOnline, isSyncing, pendingCount } = useSyncStatus();

  // Subtle pulsing animation for offline/pending
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (isSyncing || pendingCount > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSyncing, pendingCount, pulseAnim]);

  async function handlePress() {
    if (isSyncing) return;
    try {
      await syncNow();
    } catch {
      // Ignored
    }
  }

  // Determine appearance based on state
  let dotColor = '#10B981'; // Green (Synced)
  let label = 'Synced';
  let badgeBg = '#ECFDF5';
  let badgeBorder = '#A7F3D0';
  let textColor = '#065F46';

  if (!isOnline) {
    dotColor = '#EF4444'; // Red (Offline)
    label = pendingCount > 0 ? `Offline (${pendingCount})` : 'Offline';
    badgeBg = '#FEF2F2';
    badgeBorder = '#FECACA';
    textColor = '#991B1B';
  } else if (isSyncing) {
    dotColor = '#F59E0B'; // Amber (Syncing)
    label = 'Syncing...';
    badgeBg = '#FFFBEB';
    badgeBorder = '#FDE68A';
    textColor = '#92400E';
  } else if (pendingCount > 0) {
    dotColor = '#F97316'; // Orange (Pending)
    label = `Pending (${pendingCount})`;
    badgeBg = '#FFF7ED';
    badgeBorder = '#FED7AA';
    textColor = '#9A3412';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Tap to force sync.`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: badgeBg, borderColor: badgeBorder },
        pressed && styles.pressed,
      ]}>
      {isSyncing ? (
        <ActivityIndicator size={12} color={dotColor} style={styles.indicator} />
      ) : (
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: dotColor, opacity: pulseAnim },
          ]}
        />
      )}
      {!compact ? (
        <Text style={[styles.text, { color: textColor }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  pressed: {
    opacity: 0.75,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  indicator: {
    marginRight: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

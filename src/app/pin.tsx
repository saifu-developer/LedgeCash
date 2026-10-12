import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { getLoginProfile, useUserStore, verifyPin } from '@/store/users';
import { getHomeHref, setCurrentProfile } from '@/session/current-profile';

const PIN_LENGTH = 4;
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function PinScreen() {
  const params = useLocalSearchParams<{ profileId?: string | string[] }>();
  const profileId = firstParam(params.profileId);
  const users = useUserStore();
  const profile =
    profileId && users.items.some((user) => user.id === profileId && user.status === 'ACTIVE')
      ? getLoginProfile(profileId)
      : undefined;

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasCompletedLogin = useRef(false);

  useEffect(() => {
    if (hasCompletedLogin.current || pin.length !== PIN_LENGTH || !profile) {
      return;
    }

    // Swap `verifyPin` for an API auth check later.
    if (verifyPin(profile.id, pin)) {
      hasCompletedLogin.current = true;
      setCurrentProfile(profile);
      router.replace(getHomeHref(profile.role));
      return;
    }

    setError('Incorrect PIN. Please try again.');
    setPin('');
  }, [pin, profile]);

  if (!profile) {
    return null;
  }

  function handleDigit(digit: string) {
    setError(null);
    setPin((current) => (current.length >= PIN_LENGTH ? current : `${current}${digit}`));
  }

  function handleBackspace() {
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to profile selection"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/logo-icon.png')} 
            style={styles.headerIcon} 
            resizeMode="contain" 
          />
          <Text style={styles.prompt}>Enter PIN</Text>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.hint}>Enter your 4-digit PIN</Text>
        </View>

        <View style={styles.indicators} accessibilityLabel={`PIN entered ${pin.length} of ${PIN_LENGTH} digits`}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <View
              key={index}
              style={[styles.indicator, index < pin.length && styles.indicatorFilled]}
            />
          ))}
        </View>

        <Text style={[styles.error, !error && styles.errorHidden]}>{error ?? ' '}</Text>

        <View style={styles.keypad}>
          {KEYPAD_DIGITS.slice(0, 9).map((digit) => (
            <Key key={digit} label={digit} onPress={() => handleDigit(digit)} />
          ))}
          <View style={styles.key} />
          <Key label="0" onPress={() => handleDigit('0')} />
          <Key label="⌫" accessibilityLabel="Delete last digit" onPress={handleBackspace} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Key({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.key, styles.keyButton, pressed && styles.pressed]}>
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
  },
  headerIcon: {
    width: 64,
    height: 64,
    marginBottom: 16,
  },
  prompt: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  name: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: '600',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B6B6B',
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 36,
  },
  indicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C8C8C2',
    backgroundColor: 'transparent',
  },
  indicatorFilled: {
    backgroundColor: BrandColors.green,
    borderColor: BrandColors.green,
  },
  error: {
    marginTop: 20,
    minHeight: 22,
    textAlign: 'center',
    fontSize: 15,
    color: '#B42318',
  },
  errorHidden: {
    color: 'transparent',
  },
  keypad: {
    marginTop: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 16,
    rowGap: 16,
    paddingBottom: 12,
  },
  key: {
    width: 76,
    height: 76,
  },
  keyButton: {
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  keyLabel: {
    fontSize: 24,
    fontWeight: '500',
    color: BrandColors.navy,
  },
  pressed: {
    opacity: 0.72,
  },
});

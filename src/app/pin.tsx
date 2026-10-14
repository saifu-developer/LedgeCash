import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NumericKeypad, PinDots } from '@/components/ui/NumericKeypad';
import { ResetConfirmModal } from '@/components/ui/ResetConfirmModal';
import { BrandColors } from '@/constants/theme';
import { loginWithCloudOrLocal } from '@/lib/auth-service';
import { resetAllAppData } from '@/lib/reset-app';
import { getHomeHref } from '@/session/current-profile';
import { getShopsByOwner } from '@/store/shops';
import { getLoginProfile, useUserStore } from '@/store/users';

const PIN_LENGTH = 4;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default function PinScreen() {
  const params = useLocalSearchParams<{
    profileId?: string | string[];
    shopId?: string | string[];
  }>();
  const profileId = firstParam(params.profileId);
  const shopId = firstParam(params.shopId);

  const users = useUserStore();
  const rawProfile =
    profileId && users.items.some((user) => user.id === profileId && user.status === 'ACTIVE')
      ? getLoginProfile(profileId)
      : undefined;

  // Validate that a worker belongs to the requested shop if shopId is provided
  const isShopMismatch = Boolean(
    rawProfile &&
      rawProfile.role === 'WORKER' &&
      shopId &&
      rawProfile.shopId !== shopId
  );

  const profile = isShopMismatch ? undefined : rawProfile;

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(
    isShopMismatch ? 'Worker does not belong to the selected shop.' : null
  );
  const [loading, setLoading] = useState(false);

  // Forgot PIN / Reset Modal State
  const [ownerResetVisible, setOwnerResetVisible] = useState(false);
  const [workerHelpVisible, setWorkerHelpVisible] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hasCompletedLogin = useRef(false);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <View style={styles.notFoundCard}>
            <Text style={styles.notFoundIcon}>⚠️</Text>
            <Text style={styles.notFoundTitle}>Profile Inactive or Not Found</Text>
            <Text style={styles.notFoundHint}>
              {isShopMismatch
                ? 'This staff profile does not belong to the selected shop.'
                : 'The selected account could not be found or has been disabled.'}
            </Text>
            <Pressable
              style={styles.returnButton}
              onPress={() => router.replace('/')}>
              <Text style={styles.returnButtonText}>Return to Welcome</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  function handleDigit(digit: string) {
    if (hasCompletedLogin.current || loading || pin.length >= PIN_LENGTH || !profile) {
      return;
    }

    setError(null);
    const nextPin = `${pin}${digit}`;
    setPin(nextPin);

    if (nextPin.length === PIN_LENGTH) {
      setLoading(true);
      loginWithCloudOrLocal({
        profileId: profile.id,
        pin: nextPin,
        shopId: shopId || profile.shopId,
      })
        .then(() => {
          hasCompletedLogin.current = true;
          setLoading(false);
          if (profile.role === 'OWNER') {
            const owned = getShopsByOwner(profile.id);
            if (owned.length === 0) {
              router.replace('/shop-setup');
              return;
            }
          }
          router.replace(getHomeHref(profile.role));
        })
        .catch((err: any) => {
          setLoading(false);
          setError(err?.message || 'Incorrect PIN. Please try again.');
          setPin('');
        });
    }
  }

  function handleBackspace() {
    if (loading) return;
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  function handleForgotPin() {
    if (profile?.role === 'OWNER') {
      setOwnerResetVisible(true);
    } else {
      setWorkerHelpVisible(true);
    }
  }

  async function handleConfirmOwnerReset() {
    setResetting(true);
    try {
      await resetAllAppData();
      setOwnerResetVisible(false);
      router.replace('/owner-setup');
    } catch (e) {
      console.error('Owner reset failed:', e);
      setError('Failed to reset app. Please try again.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Navigation Header */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>

        {/* Profile Card Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarCircle}>
            <Image
              source={require('@/assets/images/logo-icon.png')}
              style={styles.headerIcon}
              resizeMode="contain"
            />
          </View>

          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {profile.role === 'OWNER' ? 'BUSINESS OWNER' : 'STAFF / WORKER'}
            </Text>
          </View>

          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.instructions}>Enter your 4-digit security PIN</Text>
        </View>

        {/* Visual PIN Dots Indicator */}
        <PinDots
          valueLength={pin.length}
          hasError={Boolean(error)}
        />

        {/* Error Feedback */}
        <View style={styles.errorContainer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Custom Circular Numeric Keypad */}
        <View style={styles.keypadWrapper}>
          <NumericKeypad
            onDigitPress={handleDigit}
            onBackspace={handleBackspace}
            disabled={loading}
          />
        </View>

        {/* Forgot PIN / Reset Link */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot PIN or Reset"
            onPress={handleForgotPin}
            style={({ pressed }) => [styles.forgotButton, pressed && styles.pressed]}>
            <Text style={styles.forgotButtonText}>
              {profile.role === 'OWNER'
                ? 'Forgot PIN? Reset Account'
                : 'Forgot PIN? Contact Owner'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Owner Reset Confirmation Modal */}
      <ResetConfirmModal
        visible={ownerResetVisible}
        onClose={() => setOwnerResetVisible(false)}
        onConfirm={handleConfirmOwnerReset}
        title="Forgot Owner PIN?"
        message="To maintain security without cloud recovery, resetting your account will wipe local app data so you can register a new owner profile and PIN. Proceed?"
        confirmLabel="Reset & Start Fresh"
        loading={resetting}
      />

      {/* Worker PIN Help Modal */}
      <Modal
        visible={workerHelpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWorkerHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setWorkerHelpVisible(false)}
          />
          <View style={styles.helpCard}>
            <Text style={styles.helpIcon}>🔑</Text>
            <Text style={styles.helpTitle}>Worker PIN Recovery</Text>
            <Text style={styles.helpMessage}>
              Please contact your business owner or shop manager. Your owner can view or update your 4-digit staff PIN directly in Shop Settings → Staff Management.
            </Text>
            <Pressable
              style={styles.helpButton}
              onPress={() => setWorkerHelpVisible(false)}>
              <Text style={styles.helpButtonText}>Understood</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 8,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerIcon: {
    width: 44,
    height: 44,
  },
  roleBadge: {
    backgroundColor: '#EEF2F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: BrandColors.navy,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  instructions: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  errorContainer: {
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
  keypadWrapper: {
    marginVertical: 8,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  forgotButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  forgotButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  notFoundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  notFoundIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 8,
  },
  notFoundHint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  returnButton: {
    backgroundColor: BrandColors.navy,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  returnButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 38, 80, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  helpCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  helpIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  helpTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 8,
  },
  helpMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  helpButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  helpButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

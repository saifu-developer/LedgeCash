import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NumericKeypad, PinDots } from '@/components/ui/NumericKeypad';
import { ResetConfirmModal } from '@/components/ui/ResetConfirmModal';
import { BrandColors } from '@/constants/theme';
import { resetAllAppData } from '@/lib/reset-app';
import { setActiveShopId, setCurrentProfile } from '@/session/current-profile';
import { createShop } from '@/store/shops';
import { setupOwner, useUserStore } from '@/store/users';

export default function OwnerSetupScreen() {
  const router = useRouter();
  const { items } = useUserStore();
  const existingOwner = items.find(
    (user) => user.role === 'OWNER' && user.status === 'ACTIVE'
  );

  // Form State
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [pin, setPin] = useState('');

  // UI Focus & Validation
  const [nameFocused, setNameFocused] = useState(false);
  const [shopFocused, setShopFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset Modal State
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Dynamic preview for Shop Code
  const shopCodePreview = useMemo(() => {
    const trimmed = shopName.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (trimmed.length >= 3) {
      return `LC-${trimmed.slice(0, 3)}•••`;
    }
    return 'LC-••••••';
  }, [shopName]);

  async function handleConfirmReset() {
    setResetting(true);
    try {
      await resetAllAppData();
      setResetModalVisible(false);
      setName('');
      setShopName('');
      setPin('');
      setStep(1);
      setError(null);
    } catch (e) {
      console.error('Reset failed:', e);
      setError('Failed to reset app. Please try again.');
    } finally {
      setResetting(false);
    }
  }

  function handleGoToStep2() {
    const trimmedName = name.trim();
    const trimmedShop = shopName.trim();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }

    if (!trimmedShop) {
      setError('Please enter your initial business or shop name.');
      return;
    }

    setError(null);
    setStep(2);
  }

  function handleDigitPress(digit: string) {
    if (submitting || pin.length >= 4) {
      return;
    }
    setError(null);
    const nextPin = `${pin}${digit}`;
    setPin(nextPin);
  }

  function handleBackspace() {
    if (submitting) {
      return;
    }
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }

  async function handleCreateBusiness() {
    if (pin.length !== 4) {
      setError('Please enter a 4-digit PIN to secure your account.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Create owner profile in users store
      const newOwner = await setupOwner({
        name: name.trim(),
        pin,
      });

      // 2. Create initial shop in shops table
      const newShop = await createShop(newOwner.id, shopName.trim());

      // 3. Set session
      setCurrentProfile(newOwner);
      setActiveShopId(newShop.id);

      // 4. Launch directly into Owner Dashboard
      router.replace('/owner');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create business.');
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------
  // Case A: Owner Already Exists (No Dead-End!)
  // -------------------------------------------------------------
  if (existingOwner) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>← Welcome</Text>
          </Pressable>

          <View style={styles.existingOwnerCard}>
            <View style={styles.existingIconCircle}>
              <Text style={styles.existingIconText}>👑</Text>
            </View>

            <Text style={styles.existingTitle}>Owner Account Detected</Text>
            <Text style={styles.existingSubtitle}>
              An active business owner profile is already registered on this device.
            </Text>

            <View style={styles.profileBadgeCard}>
              <View style={styles.profileBadgeAvatar}>
                <Text style={styles.profileAvatarText}>
                  {existingOwner.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileBadgeDetails}>
                <Text style={styles.profileBadgeName}>{existingOwner.name}</Text>
                <Text style={styles.profileBadgeRole}>Master Administrator</Text>
              </View>
              <View style={styles.profileStatusPill}>
                <Text style={styles.profileStatusText}>ACTIVE</Text>
              </View>
            </View>

            <View style={styles.existingActions}>
              {/* Option 1: Log In to Existing Account */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Log In to ${existingOwner.name}'s account`}
                style={({ pressed }) => [
                  styles.loginExistingButton,
                  pressed && styles.pressed,
                ]}
                onPress={() =>
                  router.replace({
                    pathname: '/pin',
                    params: { profileId: existingOwner.id },
                  })
                }>
                <Text style={styles.loginExistingButtonText}>
                  Log In to Existing Account →
                </Text>
              </Pressable>

              {/* Option 2: Reset App & Start Fresh */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset App and Start Fresh"
                style={({ pressed }) => [
                  styles.resetAppButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => setResetModalVisible(true)}>
                <Text style={styles.resetAppButtonText}>
                  Reset App & Start Fresh
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <ResetConfirmModal
          visible={resetModalVisible}
          onClose={() => setResetModalVisible(false)}
          onConfirm={handleConfirmReset}
          title="Reset App & Start Fresh?"
          message="This will completely erase all local shops, transactions, and the current owner account from this device. You will then be able to register a brand new owner."
          confirmLabel="Reset & Start Fresh"
          loading={resetting}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Case B: Fresh Owner Registration Flow
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Header Navigation */}
          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => {
                if (step === 2) {
                  setStep(1);
                } else {
                  router.back();
                }
              }}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backButtonText}>
                {step === 2 ? '← Edit Details' : '← Back'}
              </Text>
            </Pressable>

            <View style={styles.stepIndicator}>
              <Text style={styles.stepIndicatorText}>Step {step} of 2</Text>
            </View>
          </View>

          {/* Setup Header Branding */}
          <View style={styles.setupHeader}>
            <Image
              source={require('@/assets/images/logo-icon.png')}
              style={styles.setupIcon}
              resizeMode="contain"
            />
            <Text style={styles.setupTitle}>
              {step === 1 ? 'Business & Owner Setup' : 'Create Master PIN'}
            </Text>
            <Text style={styles.setupSubtitle}>
              {step === 1
                ? 'Register your primary business profile and set up your initial shop till.'
                : 'Choose a 4-digit security PIN to authorize transactions, approve withdrawals, and manage staff.'}
            </Text>
          </View>

          {/* STEP 1: Business Profile Inputs */}
          {step === 1 && (
            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>FULL LEGAL / OWNER NAME</Text>
                <TextInput
                  style={[styles.input, nameFocused && styles.inputFocused]}
                  placeholder="e.g. Irfan Ali"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={(t) => {
                    setError(null);
                    setName(t);
                  }}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>INITIAL BUSINESS / SHOP NAME</Text>
                <TextInput
                  style={[styles.input, shopFocused && styles.inputFocused]}
                  placeholder="e.g. Irfan's Kirana Store"
                  placeholderTextColor="#9CA3AF"
                  value={shopName}
                  onChangeText={(t) => {
                    setError(null);
                    setShopName(t);
                  }}
                  onFocus={() => setShopFocused(true)}
                  onBlur={() => setShopFocused(false)}
                  autoCapitalize="words"
                  editable={!submitting}
                />
              </View>

              {/* Live Shop Code Badge Preview */}
              <View style={styles.codePreviewCard}>
                <View style={styles.codePreviewLeft}>
                  <Text style={styles.codePreviewLabel}>Generated Shop Code Preview</Text>
                  <Text style={styles.codePreviewHint}>
                    Workers will use this unique code to connect to your shop.
                  </Text>
                </View>
                <View style={styles.codePreviewBadge}>
                  <Text style={styles.codePreviewBadgeText}>{shopCodePreview}</Text>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue to PIN setup"
                onPress={handleGoToStep2}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>
                  Continue to Security PIN →
                </Text>
              </Pressable>
            </View>
          )}

          {/* STEP 2: Custom On-Screen 4-Digit PIN */}
          {step === 2 && (
            <View style={styles.pinSection}>
              <PinDots valueLength={pin.length} hasError={Boolean(error)} />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <NumericKeypad
                onDigitPress={handleDigitPress}
                onBackspace={handleBackspace}
                disabled={submitting}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create Business and Launch"
                onPress={handleCreateBusiness}
                disabled={submitting || pin.length !== 4}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.launchButton,
                  (submitting || pin.length !== 4) && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Create Business & Launch 🚀
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    flexGrow: 1,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  stepIndicator: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  setupHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  setupIcon: {
    width: 60,
    height: 60,
    marginBottom: 14,
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: BrandColors.navy,
    marginBottom: 8,
    textAlign: 'center',
  },
  setupSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#062650',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: BrandColors.navy,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  inputFocused: {
    borderColor: BrandColors.green,
    backgroundColor: '#FFFFFF',
    shadowColor: BrandColors.green,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  codePreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  codePreviewLeft: {
    flex: 1,
    marginRight: 12,
  },
  codePreviewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  codePreviewHint: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 15,
  },
  codePreviewBadge: {
    backgroundColor: BrandColors.navy,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  codePreviewBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  pinSection: {
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  launchButton: {
    width: '100%',
    maxWidth: 320,
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },

  // Existing Owner Styles
  existingOwnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#062650',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  existingIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  existingIconText: {
    fontSize: 32,
  },
  existingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BrandColors.navy,
    marginBottom: 8,
    textAlign: 'center',
  },
  existingSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  profileBadgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  profileBadgeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BrandColors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  profileBadgeDetails: {
    flex: 1,
  },
  profileBadgeName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  profileBadgeRole: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  profileStatusPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  profileStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: BrandColors.green,
  },
  existingActions: {
    width: '100%',
    gap: 12,
  },
  loginExistingButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginExistingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resetAppButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  resetAppButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
});

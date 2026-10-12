import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
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

import { BrandColors } from '@/constants/theme';
import { setActiveShopId } from '@/session/current-profile';
import { createShop } from '@/store/shops';
import { setupOwner, useUserStore } from '@/store/users';
import type { Profile } from '@/types/profile';

export default function OwnerSetupScreen() {
  const router = useRouter();
  const { items } = useUserStore();
  const existingOwner = items.find(
    (user) => user.role === 'OWNER' && user.status === 'ACTIVE'
  );

  const [step, setStep] = useState<'owner' | 'shop'>('owner');
  const [createdOwner, setCreatedOwner] = useState<Profile | null>(null);

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [shopName, setShopName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleOwnerSubmit() {
    if (existingOwner) {
      setError(
        'Owner already exists. Please login as owner or continue with the existing account.'
      );
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName || pin.length !== 4) {
      setError('Please enter a valid name and 4-digit PIN.');
      return;
    }

    setSubmitting(true);
    try {
      setError('');
      const newOwner = await setupOwner({ name: trimmedName, pin });
      setCreatedOwner(newOwner);
      setShopName(`${newOwner.name}'s Shop`);
      setStep('shop');
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create owner');
      setSubmitting(false);
    }
  }

  async function handleShopSubmit() {
    if (!createdOwner) {
      setError('Owner profile missing. Please start again.');
      return;
    }

    const trimmedShopName = shopName.trim();
    if (!trimmedShopName) {
      setError('Please enter a shop name.');
      return;
    }

    setSubmitting(true);
    try {
      setError('');
      const shop = await createShop(createdOwner.id, trimmedShopName);
      try {
        setActiveShopId(shop.id);
      } catch {
        // Will be activated upon login
      }

      router.replace({
        pathname: '/pin',
        params: { profileId: createdOwner.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create shop');
      setSubmitting(false);
    }
  }

  if (existingOwner && step === 'owner') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <View style={styles.messageContainer}>
            <Text style={styles.errorText}>
              Owner already exists. Please login as owner or continue with the existing account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              if (step === 'shop') {
                setStep('owner');
              } else {
                router.back();
              }
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          {step === 'owner' ? (
            <View style={styles.section}>
              <View style={styles.setupHeader}>
                <Image
                  source={require('@/assets/images/logo-full.png')}
                  style={styles.setupLogo}
                  resizeMode="contain"
                />
                <Text style={styles.setupTitle}>Owner Setup</Text>
                <Text style={styles.sectionHint}>Let&apos;s set up the main owner account.</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Your Name"
                value={name}
                onChangeText={setName}
                autoCorrect={false}
                editable={!submitting}
              />
              <TextInput
                style={styles.input}
                placeholder="4-Digit PIN"
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                editable={!submitting}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={styles.button}
                onPress={handleOwnerSubmit}
                disabled={submitting}>
                <Text style={styles.buttonText}>
                  {submitting ? 'Creating Owner...' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.setupHeader}>
                <Image
                  source={require('@/assets/images/logo-full.png')}
                  style={styles.setupLogo}
                  resizeMode="contain"
                />
                <Text style={styles.setupTitle}>Create First Shop</Text>
                <Text style={styles.sectionHint}>
                  Set up the primary shop for your business.
                </Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Shop Name"
                value={shopName}
                onChangeText={setShopName}
                autoCorrect={false}
                editable={!submitting}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={styles.button}
                onPress={handleShopSubmit}
                disabled={submitting}>
                <Text style={styles.buttonText}>
                  {submitting ? 'Creating Shop...' : 'Create Shop & Continue'}
                </Text>
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
    paddingTop: 8,
    paddingBottom: 40,
    flexGrow: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  section: {
    gap: 12,
  },
  setupHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  setupLogo: {
    width: 220,
    height: 60,
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: BrandColors.navy,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B6B6B',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: BrandColors.navy,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  button: {
    backgroundColor: BrandColors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.86,
  },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { setupOwner, useUserStore } from '@/store/users';

export default function OwnerSetupScreen() {
  const router = useRouter();
  const { items } = useUserStore();
  const owner = items.find((user) => user.role === 'OWNER' && user.status === 'ACTIVE');
  
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSetup() {
    if (owner) {
      setError('Owner already exists. Please login as owner or continue with the existing account.');
      return;
    }
    
    if (!name || pin.length !== 4) {
      setError('Please enter a valid name and 4-digit PIN.');
      return;
    }

    setSubmitting(true);
    try {
      setError('');
      const newOwner = await setupOwner({ name, pin });
      router.replace({ pathname: '/pin', params: { profileId: newOwner.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create owner');
      setSubmitting(false);
    }
  }

  if (owner) {
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <View style={styles.section}>
            <View style={styles.setupHeader}>
              <Image 
                source={require('@/assets/images/logo-full.png')} 
                style={styles.setupLogo} 
                resizeMode="contain" 
              />
              <Text style={styles.setupTitle}>Owner Setup</Text>
              <Text style={styles.sectionHint}>Let's set up the main owner account.</Text>
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
            
            <Pressable style={styles.button} onPress={handleSetup} disabled={submitting}>
              <Text style={styles.buttonText}>{submitting ? 'Creating...' : 'Create Owner'}</Text>
            </Pressable>
          </View>
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

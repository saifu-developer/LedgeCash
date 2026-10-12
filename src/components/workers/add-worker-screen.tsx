import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
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

import { getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { addWorker, isValidPin } from '@/store/users';

export function AddWorkerScreen() {
  const session = getCurrentProfile();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (!session || session.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Add Worker</Text>
          <Text style={styles.hint}>Only the owner can add workers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function handleSubmit() {
    if (submittingRef.current) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a worker name.');
      return;
    }

    if (!isValidPin(pin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setError('PIN and confirm PIN must match.');
      return;
    }

    const activeShopId = getActiveShopId();
    if (!activeShopId) {
      setError('No active shop found. Please select or create a shop first.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await addWorker({ name: trimmedName, pin, shopId: activeShopId });
      setName('');
      setPin('');
      setConfirmPin('');
      router.replace({
        pathname: '/owner/[action]',
        params: { action: 'workers' },
      });
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Unable to create worker.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() =>
              router.replace({
                pathname: '/owner/[action]',
                params: { action: 'workers' },
              })
            }
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.kicker}>CashManager</Text>
          <Text style={styles.title}>Add Worker</Text>
          <Text style={styles.hint}>The worker can log in after you create their profile.</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Worker Name</Text>
            <TextInput
              value={name}
              onChangeText={(value) => {
                setError(null);
                setName(value);
              }}
              placeholder="Full name"
              placeholderTextColor="#B0B0AA"
              style={styles.input}
              editable={!submitting}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>4-Digit PIN</Text>
            <TextInput
              value={pin}
              onChangeText={(value) => {
                setError(null);
                setPin(value.replace(/\D/g, '').slice(0, 4));
              }}
              placeholder="••••"
              placeholderTextColor="#B0B0AA"
              style={styles.input}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              editable={!submitting}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Confirm PIN</Text>
            <TextInput
              value={confirmPin}
              onChangeText={(value) => {
                setError(null);
                setConfirmPin(value.replace(/\D/g, '').slice(0, 4));
              }}
              placeholder="••••"
              placeholderTextColor="#B0B0AA"
              style={styles.input}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              editable={!submitting}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create Worker"
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.pressed]}>
            <Text style={styles.submitText}>{submitting ? 'Creating…' : 'Create Worker'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
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
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  kicker: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  hint: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B6B6B',
  },
  card: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A86',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    paddingVertical: 4,
  },
  error: {
    marginTop: 14,
    fontSize: 15,
    color: '#B42318',
  },
  submit: {
    marginTop: 28,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.75,
  },
});

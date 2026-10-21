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

import { getCurrentProfile, isAuthorizedForShop } from '@/session/current-profile';
import { updateWorkerPinWithCloud, updateWorkerStatusWithCloud } from '@/lib/auth-service';
import { isValidPin, useUserStore } from '@/store/users';

type WorkerDetailScreenProps = {
  workerId: string;
};

export function WorkerDetailScreen({ workerId }: WorkerDetailScreenProps) {
  const session = getCurrentProfile();
  const { items } = useUserStore();
  const worker = items.find((user) => user.id === workerId);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (!session || session.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Worker</Text>
          <Text style={styles.hint}>Only the owner can manage workers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (
    !worker ||
    worker.role !== 'WORKER' ||
    (worker.shopId && !isAuthorizedForShop(session, worker.shopId))
  ) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Worker</Text>
          <Text style={styles.hint}>This worker was not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selected = worker;
  const active = selected.status === 'ACTIVE';

  async function handleStatusToggle() {
    setError(null);
    setNotice(null);
    try {
      const targetStatus = active ? 'INACTIVE' : 'ACTIVE';
      const result = await updateWorkerStatusWithCloud(selected.id, targetStatus);
      if (result.isCloudUpdated) {
        setNotice(active ? 'Worker deactivated on cloud and locally.' : 'Worker reactivated on cloud and locally.');
      } else {
        setNotice(active ? 'Worker deactivated locally (offline). Reconnect to sync with cloud.' : 'Worker reactivated locally (offline). Reconnect to sync with cloud.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update status.');
    }
  }

  async function handleChangePin() {
    if (submittingRef.current) {
      return;
    }

    if (!isValidPin(pin)) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setError('PIN and confirm PIN must match.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await updateWorkerPinWithCloud(selected.id, pin);
      setPin('');
      setConfirmPin('');
      if (result.isCloudUpdated) {
        setNotice('PIN updated on cloud and locally.');
      } else {
        setNotice('PIN updated locally (offline). Cloud PIN unchanged until online.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change PIN.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
          <Text style={styles.title}>{selected.name}</Text>
          <Text style={styles.hint}>Worker</Text>
          <Text style={[styles.status, active ? styles.active : styles.inactive]}>
            ● {active ? 'Active' : 'Inactive'}
          </Text>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={active ? 'Deactivate worker' : 'Reactivate worker'}
            onPress={handleStatusToggle}
            style={({ pressed }) => [
              styles.statusButton,
              active ? styles.deactivate : styles.reactivate,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.statusButtonText}>{active ? 'Deactivate' : 'Reactivate'}</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Change PIN</Text>
          <View style={styles.card}>
            <Text style={styles.label}>New 4-Digit PIN</Text>
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
            <Text style={styles.label}>Confirm New PIN</Text>
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
            accessibilityLabel="Save PIN"
            onPress={handleChangePin}
            disabled={submitting}
            style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.pressed]}>
            <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Save PIN'}</Text>
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
  status: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  active: {
    color: '#1F7A4D',
  },
  inactive: {
    color: '#B54708',
  },
  notice: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F7A4D',
  },
  statusButton: {
    marginTop: 24,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deactivate: {
    backgroundColor: '#B54708',
  },
  reactivate: {
    backgroundColor: '#1F7A4D',
  },
  statusButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionLabel: {
    marginTop: 32,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  card: {
    marginTop: 16,
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
    marginTop: 24,
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

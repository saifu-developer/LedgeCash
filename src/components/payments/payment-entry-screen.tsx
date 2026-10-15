import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { parseAmountInput } from '@/lib/money';
import { transactionTone } from '@/lib/transactions';
import { getCurrentProfile, getHomeHref } from '@/session/current-profile';
import { addTransaction } from '@/store/transactions';
import type { TransactionType } from '@/types/transaction';

type PaymentEntryScreenProps = {
  type: Extract<TransactionType, 'CASH_IN' | 'UPI_IN'>;
  title: string;
};

export function PaymentEntryScreen({ type, title }: PaymentEntryScreenProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const tone = transactionTone[type];

  function handleChangeAmount(value: string) {
    setError(null);
    const cleaned = value.replace(/[^0-9.]/g, '');
    const [whole = '', ...fractionParts] = cleaned.split('.');
    const fraction = fractionParts.join('').slice(0, 2);
    setAmount(cleaned.includes('.') ? `${whole}.${fraction}` : whole);
  }

  async function handleSubmit() {
    if (submittingRef.current) {
      return;
    }

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError('Enter an amount greater than 0.');
      return;
    }

    const profile = getCurrentProfile();
    if (!profile || (profile.role !== 'WORKER' && profile.role !== 'OWNER')) {
      setError('Only a logged-in worker or owner can add this payment.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await addTransaction({
        type,
        amount: parsed,
        createdBy: profile,
      });

      setAmount('');
      setError(null);
      router.replace(getHomeHref(profile.role));
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Unable to add payment.');
    }
  }

  const session = getCurrentProfile();
  const homeHref = session ? getHomeHref(session.role) : '/worker';
  const submitLabel = session?.role === 'OWNER' ? 'Save' : 'Add Payment';
  const submittingLabel = session?.role === 'OWNER' ? 'Saving…' : 'Adding…';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.replace(homeHref)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Image 
            source={require('@/assets/logo_icon.png')} 
            style={styles.kickerLogo} 
            resizeMode="contain" 
          />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>Enter the amount received.</Text>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>₹</Text>
              <TextInput
                accessibilityLabel={`${title} amount`}
                value={amount}
                onChangeText={handleChangeAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#B0B0AA"
                style={styles.input}
                editable={!submitting}
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: tone.accent },
              (pressed || submitting) && styles.pressed,
            ]}>
            <Text style={styles.submitText}>{submitting ? submittingLabel : submitLabel}</Text>
          </Pressable>
        </View>
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
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
    color: BrandColors.navy,
  },
  kickerLogo: {
    marginTop: 12,
    width: 34,
    height: 34,
  },
  title: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  hint: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B6B6B',
  },
  card: {
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A86',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currency: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1A1A1A',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 32,
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
    marginTop: 'auto',
    marginBottom: 16,
    minHeight: 56,
    borderRadius: 18,
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

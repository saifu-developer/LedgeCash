import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatInr, parseAmountInput } from '@/lib/money';
import { transactionTone, transactionTypeLabel } from '@/lib/transactions';
import { getCurrentProfile } from '@/session/current-profile';
import { editTransaction, getTransactionById, useTransactionStore } from '@/store/transactions';
import { getDisplayName } from '@/store/users';

type EditTransactionScreenProps = {
  transactionId: string;
};

export function EditTransactionScreen({ transactionId }: EditTransactionScreenProps) {
  const session = getCurrentProfile();
  const { items } = useTransactionStore();
  const transaction = items.find((item) => item.id === transactionId) ?? getTransactionById(transactionId);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (!session || session.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Edit Transaction</Text>
          <Text style={styles.hint}>Only the owner can edit transactions.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() =>
              router.replace({
                pathname: '/owner/[action]',
                params: { action: 'transactions' },
              })
            }
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Edit Transaction</Text>
          <Text style={styles.hint}>This transaction was not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selected = transaction;
  const tone = transactionTone[selected.type];

  function handleChangeAmount(value: string) {
    setError(null);
    const cleaned = value.replace(/[^0-9.]/g, '');
    const [whole = '', ...fractionParts] = cleaned.split('.');
    const fraction = fractionParts.join('').slice(0, 2);
    setAmount(cleaned.includes('.') ? `${whole}.${fraction}` : whole);
  }

  function handleSubmit() {
    if (submittingRef.current) {
      return;
    }

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError('Enter an amount greater than 0.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      editTransaction(selected.id, { amount: parsed });
      setError(null);
      router.replace({
        pathname: '/owner/[action]',
        params: { action: 'transactions' },
      });
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Unable to update transaction.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() =>
              router.replace({
                pathname: '/owner/[action]',
                params: { action: 'transactions' },
              })
            }
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.kicker}>CashManager</Text>
          <Text style={styles.title}>Edit Transaction</Text>
          <Text style={styles.hint}>
            {transactionTypeLabel(selected.type)} · originally{' '}
            {getDisplayName(selected.createdBy.id, selected.createdBy.name)} · {formatInr(selected.amount)}
          </Text>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>₹</Text>
              <TextInput
                accessibilityLabel="Corrected amount"
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
            accessibilityLabel="Save correction"
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: tone.accent },
              (pressed || submitting) && styles.pressed,
            ]}>
            <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Save Correction'}</Text>
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

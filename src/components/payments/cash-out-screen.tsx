import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { parseAmountInput } from '@/lib/money';
import { transactionTone } from '@/lib/transactions';
import { getCurrentProfile } from '@/session/current-profile';
import { addTransaction } from '@/store/transactions';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/types/transaction';

export function CashOutScreen() {
  const profile = getCurrentProfile();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const isOwner = profile?.role === 'OWNER';

  if (!profile || !isOwner) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Cash Out</Text>
          <Text style={styles.hint}>Only the owner can record a cash out.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const owner = profile;

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

    if (!category) {
      setError('Select an expense category.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await addTransaction({
        type: 'CASH_OUT',
        amount: parsed,
        createdBy: owner,
        category,
        description,
      });
      setAmount('');
      setCategory(null);
      setDescription('');
      setError(null);
      router.replace('/owner');
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Unable to save cash out.');
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
            onPress={() => router.replace('/owner')}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Image 
            source={require('@/assets/images/logo-compact.png')} 
            style={styles.kickerLogo} 
            resizeMode="contain" 
          />
          <Text style={styles.title}>Cash Out</Text>
          <Text style={styles.hint}>Record an expense paid from the till.</Text>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>₹</Text>
              <TextInput
                accessibilityLabel="Cash Out amount"
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

          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categories}>
            {EXPENSE_CATEGORIES.map((item) => {
              const selected = item === category;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setError(null);
                    setCategory(item);
                  }}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    selected && styles.categoryChipSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              accessibilityLabel="Cash Out description"
              value={description}
              onChangeText={setDescription}
              placeholder="Short note"
              placeholderTextColor="#B0B0AA"
              style={styles.description}
              editable={!submitting}
              maxLength={80}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save Cash Out"
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              (pressed || submitting) && styles.pressed,
            ]}>
            <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Save Cash Out'}</Text>
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
    color: BrandColors.navy,
  },
  kickerLogo: {
    marginTop: 16,
    width: 120,
    height: 36,
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
    marginTop: 24,
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
  sectionLabel: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  categoryChipSelected: {
    backgroundColor: '#FBECEA',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  categoryTextSelected: {
    color: '#B54708',
  },
  description: {
    marginTop: 10,
    fontSize: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: transactionTone.CASH_OUT.accent,
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

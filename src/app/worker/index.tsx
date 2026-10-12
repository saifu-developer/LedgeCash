import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionRow } from '@/components/dashboard/transaction-row';
import { formatInr } from '@/lib/money';
import { transactionTone } from '@/lib/transactions';
import { useCurrentProfile } from '@/session/current-profile';
import {
  clearSuccessNotice,
  getTodayOverviewForUser,
  getWorkerPayments,
  useTransactionStore,
} from '@/store/transactions';

export default function WorkerHomeScreen() {
  const router = useRouter();
  const profile = useCurrentProfile();
  const { notice } = useTransactionStore();

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = setTimeout(() => {
      clearSuccessNotice();
    }, 2800);

    return () => clearTimeout(timeout);
  }, [notice]);

  if (!profile) {
    return null;
  }

  const overview = getTodayOverviewForUser(profile.id);
  const recent = getWorkerPayments(profile.id).slice(0, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/logo-compact.png')} 
            style={styles.headerLogo} 
            resizeMode="contain" 
          />
          <Text style={styles.name}>{profile.name}</Text>
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Today</Text>
        <View style={styles.stats}>
          <StatCard
            label="Cash In"
            value={formatInr(overview.cashIn)}
            accent={transactionTone.CASH_IN.accent}
            background={transactionTone.CASH_IN.background}
          />
          <StatCard
            label="UPI In"
            value={formatInr(overview.upiIn)}
            accent={transactionTone.UPI_IN.accent}
            background={transactionTone.UPI_IN.background}
          />
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total In</Text>
          <Text style={styles.totalValue}>{formatInr(overview.totalIn)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cash In"
          onPress={() =>
            router.push({
              pathname: '/worker/[action]',
              params: { action: 'cash-in' },
            })
          }
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: transactionTone.CASH_IN.accent },
            pressed && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>Cash In</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="UPI In"
          onPress={() =>
            router.push({
              pathname: '/worker/[action]',
              params: { action: 'upi-in' },
            })
          }
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: transactionTone.UPI_IN.accent },
            pressed && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>UPI In</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelInline}>My Recent Payments</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
            onPress={() =>
              router.push({
                pathname: '/worker/[action]',
                params: { action: 'transactions' },
              })
            }
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.listCard}>
          {recent.length === 0 ? (
            <Text style={styles.empty}>No payments yet.</Text>
          ) : (
            recent.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                showEnteredBy={false}
                showDate
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerLogo: {
    width: 140,
    height: 48,
    marginBottom: 4,
  },
  name: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  notice: {
    backgroundColor: '#E8F6EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  noticeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F7A4D',
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabelInline: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.green,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  totalCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  totalValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  primaryButton: {
    minHeight: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  empty: {
    paddingVertical: 20,
    fontSize: 15,
    color: '#6B6B6B',
  },
  pressed: {
    opacity: 0.82,
  },
});

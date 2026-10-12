import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionRow } from '@/components/dashboard/transaction-row';
import { formatInr } from '@/lib/money';
import { OWNER_ACTIONS, type OwnerAction } from '@/lib/placeholder-actions';
import { transactionTone } from '@/lib/transactions';
import { useCurrentProfile } from '@/session/current-profile';
import {
  clearSuccessNotice,
  getRecentTransactions,
  getTodayOverview,
  useTransactionStore,
} from '@/store/transactions';

function greetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

const ACTION_ITEMS = Object.entries(OWNER_ACTIONS) as [OwnerAction, string][];

export default function OwnerHomeScreen() {
  const router = useRouter();
  const profile = useCurrentProfile();
  const { notice } = useTransactionStore();
  const overview = getTodayOverview();
  const recent = getRecentTransactions(8);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/logo-compact.png')} 
            style={styles.headerLogo} 
            resizeMode="contain" 
          />
          <Text style={styles.greeting}>
            {greetingPrefix()}, {profile.name}
          </Text>
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Today's Overview</Text>
        <View style={styles.overviewGrid}>
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
        <View style={styles.overviewGrid}>
          <StatCard label="Total In" value={formatInr(overview.totalIn)} />
          <StatCard
            label="Cash Out"
            value={formatInr(overview.cashOut)}
            accent={transactionTone.CASH_OUT.accent}
            background={transactionTone.CASH_OUT.background}
          />
        </View>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>{formatInr(overview.balance)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cash In"
          onPress={() =>
            router.push({
              pathname: '/owner/[action]',
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
              pathname: '/owner/[action]',
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cash Out"
          onPress={() =>
            router.push({
              pathname: '/owner/[action]',
              params: { action: 'cash-out' },
            })
          }
          style={({ pressed }) => [styles.cashOutButton, pressed && styles.pressed]}>
          <Text style={styles.cashOutButtonText}>Cash Out</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Recent Transactions</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
            onPress={() =>
              router.push({
                pathname: '/owner/[action]',
                params: { action: 'transactions' },
              })
            }
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.listCard}>
          {recent.length === 0 ? (
            <Text style={styles.empty}>No transactions yet.</Text>
          ) : (
            recent.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))
          )}
        </View>

        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.actions}>
          {ACTION_ITEMS.map(([action, label]) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() =>
                router.push({
                  pathname: '/owner/[action]',
                  params: { action },
                })
              }
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.actionText}>{label}</Text>
            </Pressable>
          ))}
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
    marginBottom: 28,
  },
  headerLogo: {
    width: 140,
    height: 48,
    marginBottom: 4,
  },
  greeting: {
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
  sectionHeader: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.green,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  balanceCard: {
    borderRadius: 18,
    backgroundColor: BrandColors.navy,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C8C8C2',
  },
  balanceValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cashOutButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: transactionTone.CASH_OUT.accent,
    marginBottom: 24,
  },
  cashOutButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  empty: {
    paddingVertical: 20,
    fontSize: 15,
    color: '#6B6B6B',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    width: '47%',
    flexGrow: 1,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});

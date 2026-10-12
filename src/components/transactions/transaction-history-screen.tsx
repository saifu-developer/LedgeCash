import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionRow } from '@/components/dashboard/transaction-row';
import { formatInr } from '@/lib/money';
import {
  calculatePeriodSummary,
  filterTransactionsByPeriod,
  PERIOD_LABELS,
  TRANSACTION_PERIODS,
  type TransactionPeriod,
} from '@/lib/periods';
import { transactionTone } from '@/lib/transactions';
import { deleteTransaction, useTransactionStore } from '@/store/transactions';
import type { UserRole } from '@/types/profile';
import type { Transaction } from '@/types/transaction';

type TransactionHistoryScreenProps = {
  role: UserRole;
  profileId: string;
};

export function TransactionHistoryScreen({ role, profileId }: TransactionHistoryScreenProps) {
  const [period, setPeriod] = useState<TransactionPeriod>('all');
  const { items } = useTransactionStore();

  const source = useMemo(() => {
    const sorted = [...items].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );

    if (role === 'OWNER') {
      return sorted;
    }

    return sorted.filter(
      (transaction) => transaction.createdBy.id === profileId && transaction.type !== 'CASH_OUT',
    );
  }, [items, profileId, role]);
  const filtered = useMemo(
    () => filterTransactionsByPeriod(source, period),
    [source, period],
  );
  const summary = useMemo(() => calculatePeriodSummary(filtered), [filtered]);
  const backHref = role === 'OWNER' ? '/owner' : '/worker';
  const showOwnerTotals = role === 'OWNER';
  const canManageTransactions = role === 'OWNER';

  async function confirmDelete(transaction: Transaction) {
    const message = 'Delete this transaction? The correction will stay in history.';

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        try {
          await deleteTransaction(transaction.id);
        } catch (e) {
          Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete');
        }
      }
      return;
    }

    Alert.alert('Delete transaction', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(transaction.id);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace(backHref)}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.kicker}>CashManager</Text>
        <Text style={styles.title}>Transactions</Text>

        <View style={styles.filters}>
          {TRANSACTION_PERIODS.map((item) => {
            const selected = item === period;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPeriod(item)}
                style={({ pressed }) => [
                  styles.filterChip,
                  selected && styles.filterChipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {PERIOD_LABELS[item]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {filtered.length === 0 ? (
          <Text style={styles.empty}>No transactions found</Text>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Summary</Text>
            <View style={styles.grid}>
              <StatCard
                label="Cash In"
                value={formatInr(summary.cashIn)}
                accent={transactionTone.CASH_IN.accent}
                background={transactionTone.CASH_IN.background}
              />
              <StatCard
                label="UPI In"
                value={formatInr(summary.upiIn)}
                accent={transactionTone.UPI_IN.accent}
                background={transactionTone.UPI_IN.background}
              />
            </View>
            <View style={[styles.grid, !showOwnerTotals && styles.lastGrid]}>
              <StatCard label="Total In" value={formatInr(summary.totalIn)} />
              {showOwnerTotals ? (
                <StatCard
                  label="Cash Out"
                  value={formatInr(summary.cashOut)}
                  accent={transactionTone.CASH_OUT.accent}
                  background={transactionTone.CASH_OUT.background}
                />
              ) : null}
            </View>
            {showOwnerTotals ? (
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Balance</Text>
                <Text style={styles.balanceValue}>{formatInr(summary.balance)}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Activity</Text>
            <View style={styles.listCard}>
              {filtered.map((transaction) => (
                <View key={transaction.id}>
                  <TransactionRow
                    transaction={transaction}
                    showEnteredBy={role === 'OWNER'}
                    showDate
                  />
                  {canManageTransactions ? (
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${transaction.id}`}
                        onPress={() =>
                          router.push({
                            pathname: '/owner/transaction/[id]',
                            params: { id: transaction.id },
                          })
                        }
                        style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}>
                        <Text style={styles.rowActionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${transaction.id}`}
                        onPress={() => confirmDelete(transaction)}
                        style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}>
                        <Text style={styles.rowActionDanger}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )}
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
    paddingTop: 8,
    paddingBottom: 40,
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
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
  },
  filterChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: '#1A1A1A',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  filterTextSelected: {
    color: '#FFFFFF',
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  lastGrid: {
    marginBottom: 8,
  },
  balanceCard: {
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    paddingVertical: 18,
    paddingHorizontal: 18,
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
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 12,
    paddingLeft: 96,
  },
  rowAction: {
    minHeight: 32,
    justifyContent: 'center',
  },
  rowActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  rowActionDanger: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B42318',
  },
  empty: {
    marginTop: 36,
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});

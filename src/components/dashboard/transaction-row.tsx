import { StyleSheet, Text, View } from 'react-native';

import { formatDate, formatInr, formatTime } from '@/lib/money';
import { transactionTone, transactionTypeLabel } from '@/lib/transactions';
import { getDisplayName } from '@/store/users';
import type { Transaction } from '@/types/transaction';

type TransactionRowProps = {
  transaction: Transaction;
  showEnteredBy?: boolean;
  showDate?: boolean;
};

export function TransactionRow({
  transaction,
  showEnteredBy = true,
  showDate = false,
}: TransactionRowProps) {
  const tone = transactionTone[transaction.type];
  const metaParts = [
    transaction.type === 'CASH_OUT' ? transaction.category : null,
    showEnteredBy ? getDisplayName(transaction.createdBy.id, transaction.createdBy.name) : null,
    formatTime(transaction.createdAt),
    showDate ? formatDate(transaction.createdAt) : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: tone.background }]}>
        <Text style={[styles.badgeText, { color: tone.accent }]}>
          {transactionTypeLabel(transaction.type)}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.amount}>{formatInr(transaction.amount)}</Text>
        <Text style={styles.meta}>{metaParts.join(' · ')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  meta: {
    marginTop: 3,
    fontSize: 13,
    color: '#6B6B6B',
  },
});

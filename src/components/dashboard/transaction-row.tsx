import { Ionicons } from '@expo/vector-icons';
import React from 'react';
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

function getTransactionIcon(type: Transaction['type'], color: string) {
  if (type === 'CASH_IN') {
    return <Ionicons name="arrow-down" size={12} color={color} style={styles.badgeIcon} />;
  }
  if (type === 'UPI_IN') {
    return <Ionicons name="phone-portrait-outline" size={12} color={color} style={styles.badgeIcon} />;
  }
  return <Ionicons name="arrow-up" size={12} color={color} style={styles.badgeIcon} />;
}

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
        {getTransactionIcon(transaction.type, tone.accent)}
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
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
});

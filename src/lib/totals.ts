import type { DailyOverview, Transaction, TransactionType } from '@/types/transaction';

export function calculateCashIn(transactions: Transaction[]): number {
  return sumByType(transactions, 'CASH_IN');
}

export function calculateUpiIn(transactions: Transaction[]): number {
  return sumByType(transactions, 'UPI_IN');
}

export function calculateCashOut(transactions: Transaction[]): number {
  return sumByType(transactions, 'CASH_OUT');
}

export function calculateTotalIn(transactions: Transaction[]): number {
  return calculateCashIn(transactions) + calculateUpiIn(transactions);
}

export function calculateBalance(transactions: Transaction[]): number {
  return calculateTotalIn(transactions) - calculateCashOut(transactions);
}

export function getDailyOverview(transactions: Transaction[]): DailyOverview {
  return {
    cashIn: calculateCashIn(transactions),
    upiIn: calculateUpiIn(transactions),
    cashOut: calculateCashOut(transactions),
    totalIn: calculateTotalIn(transactions),
    balance: calculateBalance(transactions),
  };
}

function sumByType(transactions: Transaction[], type: TransactionType): number {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

import type { TransactionType } from '@/types/transaction';

export function transactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'CASH_IN':
      return 'Cash In';
    case 'UPI_IN':
      return 'UPI In';
    case 'CASH_OUT':
      return 'Cash Out';
  }
}

export const transactionTone = {
  CASH_IN: {
    background: '#E8F6EE',
    accent: '#1F7A4D',
  },
  UPI_IN: {
    background: '#E8F1FA',
    accent: '#1B6AA3',
  },
  CASH_OUT: {
    background: '#FBECEA',
    accent: '#B54708',
  },
} as const;

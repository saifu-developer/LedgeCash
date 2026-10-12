import { getDailyOverview } from '@/lib/totals';
import type { DailyOverview, Transaction } from '@/types/transaction';

export const TRANSACTION_PERIODS = ['all', 'today', 'week', 'month', 'year'] as const;

export type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number];

export const PERIOD_LABELS: Record<TransactionPeriod, string> = {
  all: 'All',
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfLocalWeek(date: Date): Date {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const daysFromMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysFromMonday);
  return start;
}

function endOfLocalWeek(date: Date): Date {
  const end = startOfLocalWeek(date);
  end.setDate(end.getDate() + 6);
  return endOfLocalDay(end);
}

export function getPeriodRange(period: TransactionPeriod, now = new Date()): { start: Date; end: Date } | null {
  if (period === 'all') {
    return null;
  }

  if (period === 'today') {
    return { start: startOfLocalDay(now), end: endOfLocalDay(now) };
  }

  if (period === 'week') {
    return { start: startOfLocalWeek(now), end: endOfLocalWeek(now) };
  }

  if (period === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: endOfLocalDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: endOfLocalDay(new Date(now.getFullYear(), 11, 31)),
  };
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: TransactionPeriod,
  now = new Date(),
): Transaction[] {
  const range = getPeriodRange(period, now);

  if (!range) {
    return [...transactions];
  }

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  return transactions.filter((transaction) => {
    const createdMs = new Date(transaction.createdAt).getTime();
    return createdMs >= startMs && createdMs <= endMs;
  });
}

export function calculatePeriodSummary(transactions: Transaction[]): DailyOverview {
  return getDailyOverview(transactions);
}

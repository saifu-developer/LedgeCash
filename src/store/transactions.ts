import { useSyncExternalStore } from 'react';

import { formatInr, isSameCalendarDay } from '@/lib/money';
import { getDailyOverview } from '@/lib/totals';
import { transactionTypeLabel } from '@/lib/transactions';
import { getCurrentProfile } from '@/session/current-profile';
import { recordAudit } from '@/store/audit';
import type { Profile } from '@/types/profile';
import type { ExpenseCategory, Transaction, TransactionType } from '@/types/transaction';
import { getDb } from '@/lib/db';

type Listener = () => void;

type TransactionSnapshot = {
  items: Transaction[];
  notice: string | null;
  hydrated: boolean;
};

type AddTransactionInput = {
  type: TransactionType;
  amount: number;
  createdBy: Profile;
  category?: ExpenseCategory;
  description?: string;
};

type EditTransactionInput = {
  amount: number;
};

/**
 * Temporary in-memory ledger. Replace addTransaction / getters with API calls later.
 */
function todayAt(hours: number, minutes: number): string {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function atLocal(year: number, monthIndex: number, day: number, hours: number, minutes: number): string {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).toISOString();
}

function daysAgo(days: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const now = new Date();

const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn-1',
    type: 'CASH_IN',
    amount: 2500,
    createdAt: todayAt(9, 15),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-2',
    type: 'CASH_IN',
    amount: 1500,
    createdAt: todayAt(9, 40),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-3',
    type: 'CASH_IN',
    amount: 1000,
    createdAt: todayAt(10, 32),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-4',
    type: 'UPI_IN',
    amount: 500,
    createdAt: todayAt(11, 15),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-5',
    type: 'UPI_IN',
    amount: 2000,
    createdAt: todayAt(11, 45),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-7',
    type: 'UPI_IN',
    amount: 1000,
    createdAt: todayAt(13, 20),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-week-1',
    type: 'CASH_IN',
    amount: 800,
    createdAt: daysAgo(2, 16, 10),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-month-1',
    type: 'UPI_IN',
    amount: 1200,
    createdAt: daysAgo(10, 11, 5),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-month-2',
    type: 'CASH_OUT',
    amount: 900,
    createdAt: daysAgo(12, 18, 40),
    createdBy: { id: 'owner-irfan-ali', name: 'Irfan ALI' },
    category: 'Supplies',
  },
  {
    id: 'txn-year-1',
    type: 'CASH_IN',
    amount: 3000,
    createdAt: atLocal(now.getFullYear(), Math.max(now.getMonth() - 2, 0), 8, 10, 20),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-year-2',
    type: 'CASH_OUT',
    amount: 1500,
    createdAt: atLocal(now.getFullYear(), Math.max(now.getMonth() - 3, 0), 4, 9, 0),
    createdBy: { id: 'owner-irfan-ali', name: 'Irfan ALI' },
    category: 'Rent',
  },
  {
    id: 'txn-last-year',
    type: 'CASH_IN',
    amount: 4500,
    createdAt: atLocal(now.getFullYear() - 1, 6, 18, 14, 30),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
];

const listeners = new Set<Listener>();
let snapshot: TransactionSnapshot = {
  items: [],
  notice: null,
  hydrated: false,
};

let loadPromise: Promise<void> | null = null;

export function reloadPersistedTransactions() {
  loadPromise = null;
  return loadPersistedTransactions();
}

async function seedDemoDataIfEmpty(db: any) {
  const countRow = await db.getFirstAsync('SELECT COUNT(*) as count FROM transactions') as { count: number } | null;
  if (countRow?.count === 0) {
    for (const t of SEED_TRANSACTIONS) {
      await db.runAsync(
        'INSERT OR IGNORE INTO transactions (id, type, amount, createdAt, createdById, createdByName, category, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [t.id, t.type, t.amount, t.createdAt, t.createdBy.id, t.createdBy.name, t.category || null, t.description || null]
      );
    }
  }
}

export function loadPersistedTransactions(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const db = await getDb();
      await seedDemoDataIfEmpty(db);

      const rows = await db.getAllAsync<any>('SELECT * FROM transactions ORDER BY createdAt DESC');
      
      let items: Transaction[] = [];
      if (rows.length > 0) {
        items = rows.map(row => ({
          id: row.id,
          type: row.type,
          amount: row.amount,
          createdAt: row.createdAt,
          createdBy: { id: row.createdById, name: row.createdByName },
          ...(row.category ? { category: row.category } : {}),
          ...(row.description ? { description: row.description } : {}),
        }));
      }

      emit({ items, notice: null, hydrated: true });
    } catch (e) {
      console.error('Failed to load transactions:', e);
      emit({ items: [...SEED_TRANSACTIONS], notice: null, hydrated: true });
    }
  })();

  return loadPromise;
}

function emit(next: TransactionSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TransactionSnapshot {
  return snapshot;
}

function createId(): string {
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByNewest(items: Transaction[]): Transaction[] {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function requireOwner(): Profile {
  const session = getCurrentProfile();
  if (!session || session.role !== 'OWNER') {
    throw new Error('Only the owner can edit or delete transactions.');
  }

  return session;
}

function findTransaction(id: string): Transaction {
  const transaction = snapshot.items.find((item) => item.id === id);
  if (!transaction) {
    throw new Error('Transaction not found.');
  }

  return transaction;
}

function todayTransactions(items: Transaction[]): Transaction[] {
  return items.filter((transaction) => isSameCalendarDay(transaction.createdAt));
}

export function addTransaction(input: AddTransactionInput): Transaction {
  const session = getCurrentProfile();

  if (input.type === 'CASH_OUT') {
    if (!session || session.role !== 'OWNER') {
      throw new Error('Only the owner can create cash out transactions.');
    }

    if (!input.category) {
      throw new Error('A category is required for cash out.');
    }
  }

  const description = input.description?.trim();
  const transaction: Transaction = {
    id: createId(),
    type: input.type,
    amount: input.amount,
    createdAt: new Date().toISOString(),
    createdBy: {
      id: input.createdBy.id,
      name: input.createdBy.name,
    },
    ...(input.type === 'CASH_OUT' ? { category: input.category } : {}),
    ...(description ? { description } : {}),
  };

  emit({
    items: [transaction, ...snapshot.items],
    notice: `${transactionTypeLabel(transaction.type)} of ${formatInr(transaction.amount)} added`,
    hydrated: snapshot.hydrated,
  });

  getDb().then(db => {
    db.runAsync(
      'INSERT OR REPLACE INTO transactions (id, type, amount, createdAt, createdById, createdByName, category, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [transaction.id, transaction.type, transaction.amount, transaction.createdAt, transaction.createdBy.id, transaction.createdBy.name, transaction.category || null, transaction.description || null]
    ).catch(e => {
      console.error('Failed to persist transaction:', e);
      reloadPersistedTransactions();
    });
  });

  return transaction;
}

export function getTransactionById(id: string): Transaction | undefined {
  return snapshot.items.find((item) => item.id === id);
}

export function editTransaction(id: string, input: EditTransactionInput): Transaction {
  const owner = requireOwner();
  const existing = findTransaction(id);

  if (existing.amount === input.amount) {
    return existing;
  }

  recordAudit({
    action: 'EDIT',
    transactionId: existing.id,
    originalAmount: existing.amount,
    newAmount: input.amount,
    originalType: existing.type,
    createdBy: existing.createdBy,
    correctedBy: {
      id: owner.id,
      name: owner.name,
    },
    ...(existing.category ? { category: existing.category } : {}),
    ...(existing.description ? { description: existing.description } : {}),
  });

  const next: Transaction = {
    ...existing,
    amount: input.amount,
  };

  emit({
    items: snapshot.items.map((item) => (item.id === id ? next : item)),
    notice: `${transactionTypeLabel(next.type)} updated to ${formatInr(next.amount)}`,
    hydrated: snapshot.hydrated,
  });

  getDb().then(db => {
    db.runAsync(
      'UPDATE transactions SET amount = ? WHERE id = ?',
      [next.amount, next.id]
    ).catch(e => {
      console.error('Failed to update transaction:', e);
      reloadPersistedTransactions();
    });
  });

  return next;
}

export function deleteTransaction(id: string): void {
  const owner = requireOwner();
  const existing = findTransaction(id);

  recordAudit({
    action: 'DELETE',
    transactionId: existing.id,
    originalAmount: existing.amount,
    newAmount: null,
    originalType: existing.type,
    createdBy: existing.createdBy,
    correctedBy: {
      id: owner.id,
      name: owner.name,
    },
    ...(existing.category ? { category: existing.category } : {}),
    ...(existing.description ? { description: existing.description } : {}),
  });

  emit({
    items: snapshot.items.filter((item) => item.id !== id),
    notice: `${transactionTypeLabel(existing.type)} of ${formatInr(existing.amount)} deleted`,
    hydrated: snapshot.hydrated,
  });

  getDb().then(db => {
    db.runAsync('DELETE FROM transactions WHERE id = ?', [id])
      .catch(e => {
        console.error('Failed to delete transaction:', e);
        reloadPersistedTransactions();
      });
  });
}

export function getTransactions(): Transaction[] {
  return sortByNewest(snapshot.items);
}

export function getTransactionsByUser(profileId: string): Transaction[] {
  return getTransactions().filter((transaction) => transaction.createdBy.id === profileId);
}

export function getWorkerPayments(profileId: string): Transaction[] {
  return getTransactionsByUser(profileId).filter((transaction) => transaction.type !== 'CASH_OUT');
}

export function getRecentTransactions(limit = 8): Transaction[] {
  return getTransactions().slice(0, limit);
}

export function getTodayOverview() {
  return getDailyOverview(todayTransactions(getTransactions()));
}

export function getTodayOverviewForUser(profileId: string) {
  return getDailyOverview(todayTransactions(getWorkerPayments(profileId)));
}

export function calculateCashIn() {
  return getTodayOverview().cashIn;
}

export function calculateUpiIn() {
  return getTodayOverview().upiIn;
}

export function calculateTotalIn() {
  return getTodayOverview().totalIn;
}

export function calculateCashOut() {
  return getTodayOverview().cashOut;
}

export function calculateBalance() {
  return getTodayOverview().balance;
}

export function clearSuccessNotice() {
  if (snapshot.notice === null) {
    return;
  }

  emit({
    items: snapshot.items,
    notice: null,
    hydrated: snapshot.hydrated,
  });
}

export function useTransactionStore(): TransactionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

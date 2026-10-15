import { useSyncExternalStore } from 'react';

import { getDb } from '@/lib/db';
import { formatInr, isSameCalendarDay } from '@/lib/money';
import { getDailyOverview } from '@/lib/totals';
import { transactionTypeLabel } from '@/lib/transactions';
import {
  getActiveShopId,
  getCurrentProfile,
  isAuthorizedForShop,
  subscribeToSession,
} from '@/session/current-profile';
import { recordAudit } from '@/store/audit';
import {
  refreshPendingCount,
  registerSyncCompleteCallback,
  triggerSync,
} from '@/lib/sync-service';
import type { Profile } from '@/types/profile';
import type { ExpenseCategory, SyncStatus, Transaction, TransactionType } from '@/types/transaction';

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
  shopId?: string;
  category?: ExpenseCategory;
  description?: string;
};

type EditTransactionInput = {
  amount: number;
};

function todayAt(hours: number, minutes: number): string {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function atLocal(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number
): string {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).toISOString();
}

function daysAgo(days: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const now = new Date();
const SEED_SHOP_ID = 'LC-DEMO01';

const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn-1',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 2500,
    createdAt: todayAt(9, 15),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-2',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 1500,
    createdAt: todayAt(9, 40),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-3',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 1000,
    createdAt: todayAt(10, 32),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-4',
    shopId: SEED_SHOP_ID,
    type: 'UPI_IN',
    amount: 500,
    createdAt: todayAt(11, 15),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-5',
    shopId: SEED_SHOP_ID,
    type: 'UPI_IN',
    amount: 2000,
    createdAt: todayAt(11, 45),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-7',
    shopId: SEED_SHOP_ID,
    type: 'UPI_IN',
    amount: 1000,
    createdAt: todayAt(13, 20),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-week-1',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 800,
    createdAt: daysAgo(2, 16, 10),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-month-1',
    shopId: SEED_SHOP_ID,
    type: 'UPI_IN',
    amount: 1200,
    createdAt: daysAgo(10, 11, 5),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
  {
    id: 'txn-month-2',
    shopId: SEED_SHOP_ID,
    type: 'CASH_OUT',
    amount: 900,
    createdAt: daysAgo(12, 18, 40),
    createdBy: { id: 'owner-irfan-ali', name: 'Irfan ALI' },
    category: 'Supplies',
  },
  {
    id: 'txn-year-1',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 3000,
    createdAt: atLocal(now.getFullYear(), Math.max(now.getMonth() - 2, 0), 8, 10, 20),
    createdBy: { id: 'worker-placeholder-1', name: 'Worker A (placeholder)' },
  },
  {
    id: 'txn-year-2',
    shopId: SEED_SHOP_ID,
    type: 'CASH_OUT',
    amount: 1500,
    createdAt: atLocal(now.getFullYear(), Math.max(now.getMonth() - 3, 0), 4, 9, 0),
    createdBy: { id: 'owner-irfan-ali', name: 'Irfan ALI' },
    category: 'Rent',
  },
  {
    id: 'txn-last-year',
    shopId: SEED_SHOP_ID,
    type: 'CASH_IN',
    amount: 4500,
    createdAt: atLocal(now.getFullYear() - 1, 6, 18, 14, 30),
    createdBy: { id: 'worker-placeholder-2', name: 'Worker B (placeholder)' },
  },
];

const listeners = new Set<Listener>();
let allTransactions: Transaction[] = [];
let rawNotice: string | null = null;
let isHydrated = false;
let loadPromise: Promise<void> | null = null;

let cachedSnapshot: TransactionSnapshot = {
  items: [],
  notice: null,
  hydrated: false,
};

function computeSnapshot(): TransactionSnapshot {
  const profile = getCurrentProfile();
  const activeShopId = getActiveShopId();

  if (!profile || !activeShopId || !isAuthorizedForShop(profile, activeShopId)) {
    return {
      items: [],
      notice: rawNotice,
      hydrated: isHydrated,
    };
  }

  const filtered = sortByNewest(allTransactions.filter((t) => t.shopId === activeShopId));
  return {
    items: filtered,
    notice: rawNotice,
    hydrated: isHydrated,
  };
}

function updateSnapshotAndEmit() {
  cachedSnapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

// React to session/active shop changes
subscribeToSession(() => {
  updateSnapshotAndEmit();
});

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TransactionSnapshot {
  return cachedSnapshot;
}

function resolveAuthorizedShop(requestedShopId?: string): string | null {
  const profile = getCurrentProfile();
  if (!profile) {
    return null;
  }

  const shopId = requestedShopId ?? getActiveShopId();
  if (!shopId) {
    return null;
  }

  if (!isAuthorizedForShop(profile, shopId)) {
    return null;
  }

  return shopId;
}

export function reloadPersistedTransactions() {
  loadPromise = null;
  return loadPersistedTransactions();
}

registerSyncCompleteCallback(reloadPersistedTransactions);

export async function seedDemoDataIfEmpty(db: any) {
  const countRow = (await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM transactions'
  )) as { count: number } | null;

  if (countRow?.count === 0) {
    // Insert demo shop if not exists
    await db.runAsync(
      'INSERT OR IGNORE INTO shops (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)',
      [SEED_SHOP_ID, 'Demo Shop', 'owner-irfan-ali', new Date().toISOString()]
    );

    for (const t of SEED_TRANSACTIONS) {
      await db.runAsync(
        'INSERT OR IGNORE INTO transactions (id, shopId, type, amount, createdAt, createdById, createdByName, category, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          t.id,
          t.shopId,
          t.type,
          t.amount,
          t.createdAt,
          t.createdBy.id,
          t.createdBy.name,
          t.category || null,
          t.description || null,
        ]
      );
    }
  }
}

export function loadPersistedTransactions(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const db = await getDb();

      const rows = await db.getAllAsync<any>(
        'SELECT id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted FROM transactions WHERE (isDeleted IS NULL OR isDeleted = 0) ORDER BY createdAt DESC'
      );

      let items: Transaction[] = [];
      if (rows.length > 0) {
        items = rows.map((row) => ({
          id: row.id,
          shopId: row.shopId,
          type: row.type,
          amount: row.amount,
          createdAt: row.createdAt,
          createdBy: { id: row.createdById, name: row.createdByName },
          ...(row.category ? { category: row.category } : {}),
          ...(row.description ? { description: row.description } : {}),
          syncStatus: (row.syncStatus as SyncStatus) || 'SYNCED',
          updatedAt: row.updatedAt || row.createdAt,
          isDeleted: row.isDeleted === 1,
        }));
      }

      allTransactions = items;
      isHydrated = true;
      updateSnapshotAndEmit();
      refreshPendingCount().catch(() => {});
    } catch (e) {
      console.error('Failed to load transactions:', e);
      allTransactions = [];
      isHydrated = true;
      updateSnapshotAndEmit();
    }
  })();

  return loadPromise;
}

function createId(): string {
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByNewest(items: Transaction[]): Transaction[] {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
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
  const transaction = allTransactions.find((item) => item.id === id);
  if (!transaction) {
    throw new Error('Transaction not found.');
  }

  return transaction;
}

function todayTransactions(items: Transaction[]): Transaction[] {
  return items.filter((transaction) => isSameCalendarDay(transaction.createdAt));
}

export async function addTransaction(input: AddTransactionInput): Promise<Transaction> {
  const session = getCurrentProfile();
  if (!session) {
    throw new Error('You must be logged in to record transactions.');
  }

  const authorizedShopId = resolveAuthorizedShop(input.shopId);
  if (!authorizedShopId) {
    throw new Error('Access denied: Unauthorized shop selection.');
  }

  if (input.type === 'CASH_OUT') {
    if (session.role !== 'OWNER') {
      throw new Error('Only the owner can create cash out transactions.');
    }

    if (!input.category) {
      throw new Error('A category is required for cash out.');
    }
  }

  const description = input.description?.trim();
  const nowIso = new Date().toISOString();
  const transaction: Transaction = {
    id: createId(),
    shopId: authorizedShopId,
    type: input.type,
    amount: input.amount,
    createdAt: nowIso,
    createdBy: {
      id: input.createdBy.id,
      name: input.createdBy.name,
    },
    ...(input.type === 'CASH_OUT' ? { category: input.category } : {}),
    ...(description ? { description } : {}),
    syncStatus: 'PENDING_INSERT',
    updatedAt: nowIso,
    isDeleted: false,
  };

  const db = await getDb();
  await db.runAsync(
    'INSERT INTO transactions (id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      transaction.id,
      transaction.shopId,
      transaction.type,
      transaction.amount,
      transaction.createdAt,
      transaction.createdBy.id,
      transaction.createdBy.name,
      transaction.category || null,
      transaction.description || null,
      'PENDING_INSERT',
      transaction.updatedAt || null,
      0,
    ]
  );

  allTransactions = [transaction, ...allTransactions];
  rawNotice = `${transactionTypeLabel(transaction.type)} of ${formatInr(transaction.amount)} added`;
  updateSnapshotAndEmit();
  triggerSync();

  return transaction;
}

export function getTransactionById(id: string, shopId?: string): Transaction | undefined {
  const transaction = allTransactions.find((item) => item.id === id);
  if (!transaction) {
    return undefined;
  }

  const profile = getCurrentProfile();
  if (!isAuthorizedForShop(profile, transaction.shopId)) {
    return undefined;
  }

  if (shopId && transaction.shopId !== shopId) {
    return undefined;
  }

  return transaction;
}

export async function editTransaction(
  id: string,
  input: EditTransactionInput
): Promise<Transaction> {
  const owner = requireOwner();
  const existing = findTransaction(id);

  if (!isAuthorizedForShop(owner, existing.shopId)) {
    throw new Error('Access denied: You do not own the shop this transaction belongs to.');
  }

  if (existing.amount === input.amount) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const db = await getDb();
  await db.runAsync(
    "UPDATE transactions SET amount = ?, syncStatus = CASE WHEN syncStatus = 'PENDING_INSERT' THEN 'PENDING_INSERT' ELSE 'PENDING_UPDATE' END, updatedAt = ? WHERE id = ? AND shopId = ?",
    [input.amount, nowIso, existing.id, existing.shopId]
  );

  await recordAudit({
    shopId: existing.shopId,
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
    updatedAt: nowIso,
    syncStatus: existing.syncStatus === 'PENDING_INSERT' ? 'PENDING_INSERT' : 'PENDING_UPDATE',
  };

  allTransactions = allTransactions.map((item) => (item.id === id ? next : item));
  rawNotice = `${transactionTypeLabel(next.type)} updated to ${formatInr(next.amount)}`;
  updateSnapshotAndEmit();
  triggerSync();

  return next;
}

export async function deleteTransaction(id: string): Promise<void> {
  const owner = requireOwner();
  const existing = findTransaction(id);

  if (!isAuthorizedForShop(owner, existing.shopId)) {
    throw new Error('Access denied: You do not own the shop this transaction belongs to.');
  }

  const nowIso = new Date().toISOString();
  const db = await getDb();

  if (existing.syncStatus === 'PENDING_INSERT') {
    await db.runAsync('DELETE FROM transactions WHERE id = ? AND shopId = ?', [
      id,
      existing.shopId,
    ]);
  } else {
    await db.runAsync(
      "UPDATE transactions SET isDeleted = 1, syncStatus = 'PENDING_DELETE', updatedAt = ? WHERE id = ? AND shopId = ?",
      [nowIso, id, existing.shopId]
    );
  }

  await recordAudit({
    shopId: existing.shopId,
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

  allTransactions = allTransactions.filter((item) => item.id !== id);
  rawNotice = `${transactionTypeLabel(existing.type)} of ${formatInr(existing.amount)} deleted`;
  updateSnapshotAndEmit();
  triggerSync();
}

export function getTransactions(shopId?: string): Transaction[] {
  const authorizedShopId = resolveAuthorizedShop(shopId);
  if (!authorizedShopId) {
    return [];
  }
  return sortByNewest(allTransactions.filter((transaction) => transaction.shopId === authorizedShopId));
}

export function getTransactionsByUser(profileId: string, shopId?: string): Transaction[] {
  return getTransactions(shopId).filter((transaction) => transaction.createdBy.id === profileId);
}

export function getWorkerPayments(profileId: string, shopId?: string): Transaction[] {
  return getTransactionsByUser(profileId, shopId).filter((transaction) => transaction.type !== 'CASH_OUT');
}

export function getRecentTransactions(limit = 8, shopId?: string): Transaction[] {
  return getTransactions(shopId).slice(0, limit);
}

export function getTodayOverview(shopId?: string) {
  return getDailyOverview(todayTransactions(getTransactions(shopId)));
}

export function getTodayOverviewForUser(profileId: string, shopId?: string) {
  return getDailyOverview(todayTransactions(getWorkerPayments(profileId, shopId)));
}

export function calculateCashIn(shopId?: string) {
  return getTodayOverview(shopId).cashIn;
}

export function calculateUpiIn(shopId?: string) {
  return getTodayOverview(shopId).upiIn;
}

export function calculateTotalIn(shopId?: string) {
  return getTodayOverview(shopId).totalIn;
}

export function calculateCashOut(shopId?: string) {
  return getTodayOverview(shopId).cashOut;
}

export function calculateBalance(shopId?: string) {
  return getTodayOverview(shopId).balance;
}

export function clearSuccessNotice() {
  if (rawNotice === null) {
    return;
  }

  rawNotice = null;
  updateSnapshotAndEmit();
}

export function useTransactionStore(): TransactionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function resetTransactionStore(): Promise<void> {
  loadPromise = null;
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions');
  allTransactions = [];
  rawNotice = null;
  isHydrated = true;
  updateSnapshotAndEmit();
}

export function _resetTransactionStoreForTesting(): void {
  allTransactions = [];
  rawNotice = null;
  isHydrated = false;
  loadPromise = null;
  cachedSnapshot = { items: [], notice: null, hydrated: false };
}

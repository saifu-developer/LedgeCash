import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

import { apiClient, getAuthToken } from '@/lib/api-client';
import { getDb } from '@/lib/db';
import { getActiveShopId } from '@/session/current-profile';
import { reloadPersistedTransactions } from '@/store/transactions';
import type { SyncStatus, TransactionType } from '@/types/transaction';

export type SyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  error: string | null;
};

type ServerTransaction = {
  id: string;
  shopId: string;
  type: TransactionType;
  amount: number;
  category?: string;
  description?: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
};

type SyncBatchResponse = {
  syncedCount: number;
  serverChanges: ServerTransaction[];
  syncTimestamp: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();

let currentState: SyncState = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
};

function emit(next: Partial<SyncState>) {
  currentState = { ...currentState, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeToSync(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncState(): SyncState {
  return currentState;
}

export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribeToSync, getSyncState, getSyncState);
}

/**
 * Recounts pending items in SQLite for the active shop
 */
export async function refreshPendingCount(): Promise<number> {
  const shopId = getActiveShopId();
  if (!shopId) {
    emit({ pendingCount: 0 });
    return 0;
  }

  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM transactions WHERE shopId = ? AND syncStatus != 'SYNCED'",
      [shopId]
    );
    const count = row?.count ?? 0;
    emit({ pendingCount: count });
    return count;
  } catch {
    return 0;
  }
}

/**
 * Core bidirectional sync worker
 */
let syncPromise: Promise<boolean> | null = null;

export async function syncNow(): Promise<boolean> {
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    const shopId = getActiveShopId();
    const token = await getAuthToken();

    // Refresh pending count before attempting
    await refreshPendingCount();

    if (!shopId || !token) {
      // User is not authenticated with remote backend; skip cloud sync
      return false;
    }

    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable !== false);
    emit({ isOnline: online });

    if (!online) {
      return false;
    }

    emit({ isSyncing: true, error: null });

    try {
      const db = await getDb();

      // 1. Fetch local pending items
      const pendingRows = await db.getAllAsync<{
        id: string;
        shopId: string;
        type: TransactionType;
        amount: number;
        createdAt: string;
        createdById: string;
        createdByName: string;
        category?: string;
        description?: string;
        syncStatus: SyncStatus;
        updatedAt?: string;
        isDeleted?: number;
      }>(
        "SELECT id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted FROM transactions WHERE shopId = ? AND syncStatus != 'SYNCED'",
        [shopId]
      );

      // Read lastSyncTimestamp from sync_meta
      const metaRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp'"
      );
      const lastSyncTimestamp = metaRow?.value ?? null;

      // 2. Prepare payload
      const transactionsPayload = pendingRows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        category: row.category || null,
        description: row.description || null,
        createdById: row.createdById,
        createdByName: row.createdByName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt || row.createdAt,
        isDeleted: row.syncStatus === 'PENDING_DELETE' || row.isDeleted === 1,
      }));

      // 3. Send batch to Spring Boot backend
      const response = await apiClient<SyncBatchResponse>('/api/v1/sync/batch', {
        method: 'POST',
        body: JSON.stringify({
          lastSyncTimestamp,
          transactions: transactionsPayload,
        }),
      });

      // 4. Update local SQLite database with results
      await db.withTransactionAsync(async () => {
        // A. Resolve pushed rows
        for (const row of pendingRows) {
          if (row.syncStatus === 'PENDING_DELETE' || row.isDeleted === 1) {
            await db.runAsync('DELETE FROM transactions WHERE id = ?', [row.id]);
          } else {
            await db.runAsync(
              "UPDATE transactions SET syncStatus = 'SYNCED' WHERE id = ?",
              [row.id]
            );
          }
        }

        // B. Apply incoming server changes
        if (response.serverChanges && response.serverChanges.length > 0) {
          for (const serverTx of response.serverChanges) {
            const local = await db.getFirstAsync<{ id: string; syncStatus: string }>(
              'SELECT id, syncStatus FROM transactions WHERE id = ?',
              [serverTx.id]
            );

            if (serverTx.deleted) {
              if (!local || local.syncStatus === 'SYNCED') {
                await db.runAsync('DELETE FROM transactions WHERE id = ?', [serverTx.id]);
              }
            } else if (local) {
              // Only overwrite if local row is not currently pending local changes
              if (local.syncStatus === 'SYNCED') {
                await db.runAsync(
                  `UPDATE transactions SET 
                    type = ?, 
                    amount = ?, 
                    category = ?, 
                    description = ?, 
                    updatedAt = ?, 
                    syncStatus = 'SYNCED',
                    isDeleted = 0 
                   WHERE id = ?`,
                  [
                    serverTx.type,
                    serverTx.amount,
                    serverTx.category || null,
                    serverTx.description || null,
                    serverTx.updatedAt || serverTx.createdAt,
                    serverTx.id,
                  ]
                );
              }
            } else {
              // Insert new server record into local SQLite
              await db.runAsync(
                `INSERT INTO transactions (
                  id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, 0)`,
                [
                  serverTx.id,
                  serverTx.shopId,
                  serverTx.type,
                  serverTx.amount,
                  serverTx.createdAt,
                  serverTx.createdById,
                  serverTx.createdByName,
                  serverTx.category || null,
                  serverTx.description || null,
                  serverTx.updatedAt || serverTx.createdAt,
                ]
              );
            }
          }
        }

        // C. Update lastSyncTimestamp in sync_meta
        if (response.syncTimestamp) {
          await db.runAsync(
            "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncTimestamp', ?)",
            [response.syncTimestamp]
          );
        }
      });

      // 5. Update UI state and reload in-memory cache
      emit({
        isSyncing: false,
        pendingCount: 0,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: null,
      });

      await reloadPersistedTransactions();
      return true;
    } catch (err: any) {
      console.warn('Sync failed:', err?.message || err);
      await refreshPendingCount();
      emit({
        isSyncing: false,
        error: err?.message || 'Sync failed',
      });
      return false;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

/**
 * Debounced background trigger
 */
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerSync(delayMs = 500): void {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  debounceTimeout = setTimeout(() => {
    debounceTimeout = null;
    syncNow().catch(() => {});
  }, delayMs);
}

/**
 * Initializes NetInfo listeners for automatic reconnect sync
 */
let isInitialized = false;

export function initSyncEngine(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // Listen to network status changes
  const unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    const wasOffline = !currentState.isOnline;
    emit({ isOnline: online });

    if (online && wasOffline) {
      // Reconnected! Auto-trigger sync
      triggerSync(1000);
    }
  });

  // Initial check & pending count
  refreshPendingCount().then((count) => {
    if (count > 0) {
      triggerSync(1000);
    }
  });

  return () => {
    unsubscribeNetInfo();
    isInitialized = false;
  };
}

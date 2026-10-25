import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

import { apiClient, getAuthToken } from '@/lib/api-client';
import { getDb } from '@/lib/db';
import { getShopIdFromJwt } from '@/lib/jwt-utils';
import { getActiveShopId } from '@/session/current-profile';
import type { SyncStatus, TransactionType } from '@/types/transaction';
import type { SyncBatchResponse, SyncState } from '@/types/sync';

export type { SyncState };

export class CrossShopSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossShopSyncError';
  }
}

export interface SyncPreflightResult {
  allowed: boolean;
  activeShopId: string | null;
  jwtShopId: string | null;
  reason?: string;
}

/**
 * Validates the strict multi-shop sync invariant before any network or database sync:
 *   ACTIVE SHOP ID === JWT SHOP ID === SYNC SHOP ID
 *
 * If either is missing or they differ, sync must abort immediately without
 * contacting the backend or modifying local records.
 */
export async function validateSyncPreflight(): Promise<SyncPreflightResult> {
  const activeShopId = getActiveShopId();
  if (!activeShopId) {
    return {
      allowed: false,
      activeShopId: null,
      jwtShopId: null,
      reason: 'Sync aborted: No activeShopId found in current session.',
    };
  }

  const token = await getAuthToken();
  if (!token) {
    return {
      allowed: false,
      activeShopId,
      jwtShopId: null,
      reason: 'Sync aborted: No authentication token found in SecureStore.',
    };
  }

  const jwtShopId = getShopIdFromJwt(token);
  if (!jwtShopId) {
    return {
      allowed: false,
      activeShopId,
      jwtShopId: null,
      reason: 'Sync aborted: Authenticated JWT contains no valid shopId claim.',
    };
  }

  if (activeShopId !== jwtShopId) {
    return {
      allowed: false,
      activeShopId,
      jwtShopId,
      reason: `Sync preflight rejected: activeShopId "${activeShopId}" does not match JWT shopId "${jwtShopId}".`,
    };
  }

  return {
    allowed: true,
    activeShopId,
    jwtShopId,
  };
}

type SyncCompleteCallback = () => Promise<void> | void;
let onSyncCompleteCallback: SyncCompleteCallback | null = null;

export function registerSyncCompleteCallback(cb: SyncCompleteCallback): void {
  onSyncCompleteCallback = cb;
}

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
 * Core bidirectional sync worker with multi-shop hardening
 */
let syncPromise: Promise<boolean> | null = null;

export async function syncNow(): Promise<boolean> {
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    // 0. Perform strict multi-shop preflight validation
    // Enforce: ACTIVE SHOP ID === JWT SHOP ID === SYNC SHOP ID
    const preflight = await validateSyncPreflight();

    // Refresh pending count before attempting
    await refreshPendingCount();

    if (!preflight.allowed) {
      if (
        preflight.activeShopId &&
        preflight.jwtShopId &&
        preflight.activeShopId !== preflight.jwtShopId
      ) {
        // Log diagnostic message without token or PIN contents
        console.warn(`[SyncPreflight] ${preflight.reason}`);
        emit({ isSyncing: false, error: preflight.reason });
      }
      return false;
    }

    const shopId = preflight.jwtShopId; // Guaranteed non-null and equal to activeShopId

    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable !== false);
    emit({ isOnline: online });

    if (!online) {
      return false;
    }

    emit({ isSyncing: true, error: null });

    try {
      const db = await getDb();

      // 1. Fetch local pending items for the authenticated shop only
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

      // Verify every pending row strictly belongs to this authenticated shop
      for (const row of pendingRows) {
        if (row.shopId !== shopId) {
          const msg = `Security violation: Pending transaction ${row.id} has shopId "${row.shopId}" (expected "${shopId}").`;
          console.warn(`[SyncSecurity] ${msg}`);
          emit({ isSyncing: false, error: 'Transaction shop mismatch detected.' });
          return false;
        }
      }

      // Read lastSyncTimestamp from sync_meta per shopId (strictly isolated per shop)
      const metaKey = `lastSyncTimestamp_${shopId}`;
      const metaRow = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_meta WHERE key = ?',
        [metaKey]
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
        // Security check on incoming server changes:
        // Reject any response record that belongs to another shop or collides with another shop locally
        if (response.serverChanges && response.serverChanges.length > 0) {
          for (const serverTx of response.serverChanges) {
            if (serverTx.shopId && serverTx.shopId !== shopId) {
              const msg = `Cross-shop remote data rejected: serverChange transaction ${serverTx.id} belongs to shop "${serverTx.shopId}", but authenticated shop is "${shopId}".`;
              console.warn(`[SyncSecurity] ${msg}`);
              throw new CrossShopSyncError(msg);
            }

            const local = await db.getFirstAsync<{ id: string; shopId: string; syncStatus: string }>(
              'SELECT id, shopId, syncStatus FROM transactions WHERE id = ?',
              [serverTx.id]
            );
            if (local && local.shopId && local.shopId !== shopId) {
              const msg = `Cross-shop collision rejected: remote transaction ${serverTx.id} collides with local transaction in shop "${local.shopId}".`;
              console.warn(`[SyncSecurity] ${msg}`);
              throw new CrossShopSyncError(msg);
            }
          }
        }

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

            const isDeleted = Boolean(serverTx.deleted || serverTx.isDeleted);

            if (isDeleted) {
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
              // Insert new server record into local SQLite (safely avoiding duplicates)
              // Strictly bind to verified shopId
              await db.runAsync(
                `INSERT OR REPLACE INTO transactions (
                  id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, 0)`,
                [
                  serverTx.id,
                  shopId,
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

        // C. Update lastSyncTimestamp in sync_meta per shopId
        if (response.syncTimestamp) {
          await db.runAsync(
            'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
            [metaKey, response.syncTimestamp]
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

      if (onSyncCompleteCallback) {
        await onSyncCompleteCallback();
      }
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

  // Periodic background poll when app is active and online (every 25 seconds)
  const intervalId = setInterval(() => {
    if (currentState.isOnline && !currentState.isSyncing && getActiveShopId()) {
      syncNow().catch(() => {});
    }
  }, 25000);

  return () => {
    clearInterval(intervalId);
    unsubscribeNetInfo();
    isInitialized = false;
  };
}

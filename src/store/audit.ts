import { useSyncExternalStore } from 'react';

import { getDb } from '@/lib/db';
import {
  getActiveShopId,
  getCurrentProfile,
  isAuthorizedForShop,
  subscribeToSession,
} from '@/session/current-profile';
import type { AuditEntry } from '@/types/audit';

type Listener = () => void;

type AuditSnapshot = {
  items: AuditEntry[];
  hydrated: boolean;
};

type RecordAuditInput = Omit<AuditEntry, 'id' | 'createdAt'>;

const listeners = new Set<Listener>();
let allAuditEntries: AuditEntry[] = [];
let isHydrated = false;
let loadPromise: Promise<void> | null = null;

let cachedSnapshot: AuditSnapshot = {
  items: [],
  hydrated: false,
};

function computeSnapshot(): AuditSnapshot {
  const profile = getCurrentProfile();
  const activeShopId = getActiveShopId();

  if (!profile || !activeShopId || !isAuthorizedForShop(profile, activeShopId)) {
    return {
      items: [],
      hydrated: isHydrated,
    };
  }

  const filtered = sortByNewest(allAuditEntries.filter((e) => e.shopId === activeShopId));
  return {
    items: filtered,
    hydrated: isHydrated,
  };
}

function updateSnapshotAndEmit() {
  cachedSnapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

subscribeToSession(() => {
  updateSnapshotAndEmit();
});

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuditSnapshot {
  return cachedSnapshot;
}

function resolveAuthorizedShop(requestedShopId?: string): string {
  const profile = getCurrentProfile();
  if (!profile) {
    throw new Error('Authentication required: No profile is currently logged in.');
  }

  const shopId = requestedShopId ?? getActiveShopId();
  if (!shopId) {
    throw new Error('No active shop selected.');
  }

  if (!isAuthorizedForShop(profile, shopId)) {
    throw new Error(
      `Access denied: Profile "${profile.name}" (${profile.role}) is not authorized for shop "${shopId}".`
    );
  }

  return shopId;
}

export function reloadPersistedAudit() {
  loadPromise = null;
  return loadPersistedAudit();
}

export function loadPersistedAudit(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<any>(
        'SELECT id, shopId, action, transactionId, originalAmount, newAmount, originalType, createdById, createdByName, correctedById, correctedByName, createdAt, category, description FROM audit ORDER BY createdAt DESC'
      );

      let items: AuditEntry[] = [];
      if (rows.length > 0) {
        items = rows.map((row) => ({
          id: row.id,
          shopId: row.shopId,
          action: row.action,
          transactionId: row.transactionId,
          originalAmount: row.originalAmount,
          newAmount: row.newAmount,
          originalType: row.originalType,
          createdBy: { id: row.createdById, name: row.createdByName },
          correctedBy: { id: row.correctedById, name: row.correctedByName },
          createdAt: row.createdAt,
          ...(row.category ? { category: row.category } : {}),
          ...(row.description ? { description: row.description } : {}),
        }));
      }

      allAuditEntries = items;
      isHydrated = true;
      updateSnapshotAndEmit();
    } catch (e) {
      console.error('Failed to load audit:', e);
      allAuditEntries = [];
      isHydrated = true;
      updateSnapshotAndEmit();
    }
  })();

  return loadPromise;
}

function createId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByNewest(items: AuditEntry[]): AuditEntry[] {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export async function recordAudit(input: RecordAuditInput): Promise<AuditEntry> {
  const profile = getCurrentProfile();
  if (!profile) {
    throw new Error('Authentication required to record audit.');
  }

  const shopId = input.shopId || getActiveShopId();
  if (!shopId || !isAuthorizedForShop(profile, shopId)) {
    throw new Error('Access denied: Profile is not authorized for this shop.');
  }

  const entry: AuditEntry = {
    id: createId(),
    shopId,
    action: input.action,
    transactionId: input.transactionId,
    originalAmount: input.originalAmount,
    newAmount: input.newAmount,
    originalType: input.originalType,
    createdBy: {
      id: input.createdBy.id,
      name: input.createdBy.name,
    },
    correctedBy: {
      id: input.correctedBy.id,
      name: input.correctedBy.name,
    },
    createdAt: new Date().toISOString(),
    ...(input.category ? { category: input.category } : {}),
    ...(input.description ? { description: input.description } : {}),
  };

  const db = await getDb();
  await db.runAsync(
    'INSERT INTO audit (id, shopId, action, transactionId, originalAmount, newAmount, originalType, createdById, createdByName, correctedById, correctedByName, createdAt, category, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      entry.id,
      entry.shopId,
      entry.action,
      entry.transactionId,
      entry.originalAmount,
      entry.newAmount,
      entry.originalType,
      entry.createdBy.id,
      entry.createdBy.name,
      entry.correctedBy.id,
      entry.correctedBy.name,
      entry.createdAt,
      entry.category || null,
      entry.description || null,
    ]
  );

  allAuditEntries = [entry, ...allAuditEntries];
  updateSnapshotAndEmit();

  return entry;
}

export function getAuditEntries(shopId?: string): AuditEntry[] {
  const authorizedShopId = resolveAuthorizedShop(shopId);
  return sortByNewest(allAuditEntries.filter((entry) => entry.shopId === authorizedShopId));
}

export function getAuditEntriesByTransaction(
  transactionId: string,
  shopId?: string
): AuditEntry[] {
  return getAuditEntries(shopId).filter((entry) => entry.transactionId === transactionId);
}

export function useAuditStore(): AuditSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function _resetAuditStoreForTesting(): void {
  allAuditEntries = [];
  isHydrated = false;
  loadPromise = null;
  cachedSnapshot = { items: [], hydrated: false };
}

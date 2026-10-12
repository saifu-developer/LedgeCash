import { useSyncExternalStore } from 'react';

import type { AuditEntry } from '@/types/audit';
import { getDb } from '@/lib/db';

type Listener = () => void;

type AuditSnapshot = {
  items: AuditEntry[];
  hydrated: boolean;
};

type RecordAuditInput = Omit<AuditEntry, 'id' | 'createdAt'>;

/**
 * Independent correction ledger. Entries are never removed when a transaction is deleted.
 */
const listeners = new Set<Listener>();
let snapshot: AuditSnapshot = {
  items: [],
  hydrated: false,
};

let loadPromise: Promise<void> | null = null;

export function reloadPersistedAudit() {
  loadPromise = null;
  return loadPersistedAudit();
}

export function loadPersistedAudit(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<any>('SELECT * FROM audit ORDER BY createdAt DESC');
      
      let items: AuditEntry[] = [];
      if (rows.length > 0) {
        items = rows.map(row => ({
          id: row.id,
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

      emit({ items, hydrated: true });
    } catch (e) {
      console.error('Failed to load audit:', e);
      emit({ items: [], hydrated: true });
    }
  })();

  return loadPromise;
}

function emit(next: AuditSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuditSnapshot {
  return snapshot;
}

function createId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByNewest(items: AuditEntry[]): AuditEntry[] {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function recordAudit(input: RecordAuditInput): AuditEntry {
  const entry: AuditEntry = {
    id: createId(),
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

  emit({
    items: [entry, ...snapshot.items],
    hydrated: snapshot.hydrated,
  });

  getDb().then(db => {
    db.runAsync(
      'INSERT OR REPLACE INTO audit (id, action, transactionId, originalAmount, newAmount, originalType, createdById, createdByName, correctedById, correctedByName, createdAt, category, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [entry.id, entry.action, entry.transactionId, entry.originalAmount, entry.newAmount, entry.originalType, entry.createdBy.id, entry.createdBy.name, entry.correctedBy.id, entry.correctedBy.name, entry.createdAt, entry.category || null, entry.description || null]
    ).catch(e => {
      console.error('Failed to persist audit entry:', e);
      reloadPersistedAudit();
    });
  });

  return entry;
}

export function getAuditEntries(): AuditEntry[] {
  return sortByNewest(snapshot.items);
}

export function getAuditEntriesByTransaction(transactionId: string): AuditEntry[] {
  return getAuditEntries().filter((entry) => entry.transactionId === transactionId);
}

export function useAuditStore(): AuditSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

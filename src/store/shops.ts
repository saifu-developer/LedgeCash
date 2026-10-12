import { useSyncExternalStore } from 'react';

import { generateShopId, getDb } from '@/lib/db';
import type { Shop } from '@/types/shop';

type Listener = () => void;

type ShopSnapshot = {
  items: Shop[];
  hydrated: boolean;
};

const listeners = new Set<Listener>();
let snapshot: ShopSnapshot = {
  items: [],
  hydrated: false,
};

let loadPromise: Promise<void> | null = null;

function emit(next: ShopSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ShopSnapshot {
  return snapshot;
}

export function reloadPersistedShops(): Promise<void> {
  loadPromise = null;
  return loadPersistedShops();
}

export function loadPersistedShops(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Shop>(
        'SELECT id, name, ownerId, createdAt FROM shops ORDER BY createdAt ASC'
      );
      emit({
        items: rows.map((r) => ({ ...r })),
        hydrated: true,
      });
    } catch (e) {
      console.error('Failed to load shops from SQLite:', e);
      emit({
        items: [],
        hydrated: true,
      });
    }
  })();

  return loadPromise;
}

export async function generateUniqueShopId(): Promise<string> {
  const db = await getDb();
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = generateShopId();
    const inMemory = snapshot.items.some((s) => s.id === candidate);
    if (inMemory) {
      continue;
    }
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM shops WHERE id = ?',
      [candidate]
    );
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Failed to generate unique shop ID after 100 attempts.');
}

export async function createShop(ownerId: string, name: string): Promise<Shop> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Shop name is required.');
  }
  if (!ownerId.trim()) {
    throw new Error('Owner ID is required.');
  }

  const id = await generateUniqueShopId();
  const shop: Shop = {
    id,
    name: trimmedName,
    ownerId,
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  await db.runAsync(
    'INSERT INTO shops (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)',
    [shop.id, shop.name, shop.ownerId, shop.createdAt]
  );

  emit({
    items: [...snapshot.items, shop],
    hydrated: snapshot.hydrated,
  });

  return shop;
}

export function getShopById(shopId: string): Shop | undefined {
  return snapshot.items.find((item) => item.id === shopId);
}

export function getShopsByOwner(ownerId: string): Shop[] {
  return snapshot.items.filter((item) => item.ownerId === ownerId);
}

export function getShops(): Shop[] {
  return snapshot.items.map((s) => ({ ...s }));
}

export async function updateShop(
  shopId: string,
  input: { name: string }
): Promise<Shop> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Shop name is required.');
  }

  const existing = snapshot.items.find((s) => s.id === shopId);
  if (!existing) {
    throw new Error('Shop not found.');
  }

  const updated: Shop = {
    ...existing,
    name: trimmedName,
  };

  const db = await getDb();
  await db.runAsync('UPDATE shops SET name = ? WHERE id = ?', [
    updated.name,
    updated.id,
  ]);

  emit({
    items: snapshot.items.map((s) => (s.id === shopId ? updated : s)),
    hydrated: snapshot.hydrated,
  });

  return updated;
}

export function useShopStore(): ShopSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function _resetShopStoreForTesting(): void {
  loadPromise = null;
  snapshot = { items: [], hydrated: false };
}

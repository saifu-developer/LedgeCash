import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { getCurrentProfile } from '@/session/current-profile';
import type { Profile, User, UserRole, UserStatus } from '@/types/profile';

type Listener = () => void;

type UserSnapshot = {
  items: User[];
  hydrated: boolean;
};

const STORAGE_KEY = 'cashmanager_users';
const listeners = new Set<Listener>();

let snapshot: UserSnapshot = {
  items: [],
  hydrated: false,
};

let loadPromise: Promise<void> | null = null;

function emit(next: UserSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function commit(next: UserSnapshot) {
  emit(next);
  if (next.hydrated) {
    await persistUsers(next.items);
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UserSnapshot {
  return snapshot;
}

function toPublicProfile(user: User): Profile {
  const { pin: _pin, ...profile } = user;
  return profile;
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'OWNER' || value === 'WORKER';
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'ACTIVE' || value === 'INACTIVE';
}

function parseStoredUsers(value: unknown): User[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const users: User[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.name !== 'string' ||
      !isUserRole(record.role) ||
      !isUserStatus(record.status) ||
      typeof record.pin !== 'string' ||
      typeof record.createdAt !== 'string'
    ) {
      return null;
    }

    users.push({
      id: record.id,
      name: record.name,
      role: record.role,
      status: record.status,
      pin: record.pin,
      createdAt: record.createdAt,
      ...(typeof record.shopId === 'string' ? { shopId: record.shopId } : {}),
    });
  }

  return users;
}



async function persistUsers(users: User[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Prototype persistence should not crash the UI.
  }
}

function requireOwner() {
  const session = getCurrentProfile();
  if (!session || session.role !== 'OWNER') {
    throw new Error('Only the owner can manage workers.');
  }

  return session;
}

function createId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function replaceUser(nextUser: User) {
  return commit({
    ...snapshot,
    items: snapshot.items.map((user) => (user.id === nextUser.id ? nextUser : user)),
  });
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function loadPersistedUsers(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parseStoredUsers(JSON.parse(raw));
        if (parsed) {
          emit({
            items: parsed,
            hydrated: true,
          });
          return;
        }
      }

      await commit({
        items: [],
        hydrated: true,
      });
    } catch {
      await commit({
        items: [],
        hydrated: true,
      });
    }
  })();

  return loadPromise;
}

export function getUsers(): User[] {
  return snapshot.items.map((user) => ({ ...user }));
}

export function getProfiles(): Profile[] {
  return snapshot.items.map(toPublicProfile);
}

export function getProfilesByRole(role: UserRole): Profile[] {
  return snapshot.items.filter((user) => user.role === role).map(toPublicProfile);
}

export function getSelectableProfiles(): Profile[] {
  return snapshot.items.filter((user) => user.status === 'ACTIVE').map(toPublicProfile);
}

export function getWorkers(): Profile[] {
  return snapshot.items.filter((user) => user.role === 'WORKER').map(toPublicProfile);
}

export function getWorkersByShop(shopId: string): Profile[] {
  return snapshot.items
    .filter((user) => user.role === 'WORKER' && user.shopId === shopId)
    .map(toPublicProfile);
}

export function getWorkerById(shopId: string, workerId: string): Profile | undefined {
  const user = snapshot.items.find(
    (item) => item.id === workerId && item.role === 'WORKER' && item.shopId === shopId
  );
  return user ? toPublicProfile(user) : undefined;
}

export function getUserById(id: string): Profile | undefined {
  const user = snapshot.items.find((item) => item.id === id);
  return user ? toPublicProfile(user) : undefined;
}

export function getLoginProfile(id: string): Profile | undefined {
  const user = snapshot.items.find((item) => item.id === id);
  if (!user || user.status !== 'ACTIVE') {
    return undefined;
  }

  return toPublicProfile(user);
}

export function getDisplayName(userId: string, fallback: string): string {
  return getUserById(userId)?.name ?? fallback;
}

export function verifyWorkerPin(shopId: string, workerId: string, pin: string): boolean {
  const user = snapshot.items.find((item) => item.id === workerId);
  if (!user || user.role !== 'WORKER' || user.status !== 'ACTIVE' || user.shopId !== shopId) {
    return false;
  }

  return user.pin === pin;
}

export function verifyPin(profileId: string, pin: string, expectedShopId?: string): boolean {
  const user = snapshot.items.find((item) => item.id === profileId);
  if (!user || user.status !== 'ACTIVE') {
    return false;
  }

  if (user.role === 'WORKER') {
    if (!user.shopId) {
      return false;
    }
    if (expectedShopId && user.shopId !== expectedShopId) {
      return false;
    }
  }

  return user.pin === pin;
}

export async function setupOwner(input: { name: string; pin: string }): Promise<Profile> {
  if (snapshot.items.some((u) => u.role === 'OWNER')) {
    throw new Error('Owner already exists.');
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('Owner name is required.');
  }

  if (!isValidPin(input.pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }

  const owner: User = {
    id: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    role: 'OWNER',
    status: 'ACTIVE',
    pin: input.pin,
    createdAt: new Date().toISOString(),
  };

  await commit({
    ...snapshot,
    items: [owner, ...snapshot.items],
  });

  return toPublicProfile(owner);
}

export async function addWorker(input: {
  name: string;
  pin: string;
  shopId: string;
}): Promise<Profile> {
  requireOwner();

  const shopId = input.shopId?.trim();
  if (!shopId) {
    throw new Error('A shop is required to create a worker.');
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('Worker name is required.');
  }

  if (!isValidPin(input.pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }

  const worker: User = {
    id: createId(),
    name,
    role: 'WORKER',
    status: 'ACTIVE',
    pin: input.pin,
    createdAt: new Date().toISOString(),
    shopId,
  };

  await commit({
    ...snapshot,
    items: [...snapshot.items, worker],
  });

  return toPublicProfile(worker);
}

export async function setWorkerStatus(workerId: string, status: UserStatus): Promise<Profile> {
  requireOwner();

  const user = snapshot.items.find((item) => item.id === workerId);
  if (!user || user.role !== 'WORKER') {
    throw new Error('Worker not found.');
  }

  const next = { ...user, status };
  await replaceUser(next);
  return toPublicProfile(next);
}

export async function changeWorkerPin(workerId: string, pin: string): Promise<Profile> {
  requireOwner();

  if (!isValidPin(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }

  const user = snapshot.items.find((item) => item.id === workerId);
  if (!user || user.role !== 'WORKER') {
    throw new Error('Worker not found.');
  }

  const next = { ...user, pin };
  await replaceUser(next);
  return toPublicProfile(next);
}

export async function changeOwnerPin(
  ownerId: string,
  oldPin: string,
  newPin: string
): Promise<Profile> {
  const session = requireOwner();
  if (session.id !== ownerId) {
    throw new Error('You can only change your own PIN.');
  }

  const user = snapshot.items.find((item) => item.id === ownerId && item.role === 'OWNER');
  if (!user) {
    throw new Error('Owner account not found.');
  }

  if (user.pin !== oldPin) {
    throw new Error('Incorrect current PIN.');
  }

  if (!isValidPin(newPin)) {
    throw new Error('New PIN must be exactly 4 digits.');
  }

  if (oldPin === newPin) {
    throw new Error('New PIN must be different from current PIN.');
  }

  const next = { ...user, pin: newPin };
  await replaceUser(next);
  return toPublicProfile(next);
}

export function useUserStore(): UserSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function resetUserStore(): Promise<void> {
  loadPromise = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  emit({
    items: [],
    hydrated: true,
  });
}

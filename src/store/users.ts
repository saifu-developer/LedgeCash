import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { getSecureUserPin, setSecureUserPin, deleteSecureUserPin } from '@/lib/secure-storage';
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

type ParsedStoredUser = {
  user: Profile;
  legacyPin?: string;
};

function parseStoredUsers(value: unknown): ParsedStoredUser[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const users: ParsedStoredUser[] = [];

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
      typeof record.createdAt !== 'string'
    ) {
      return null;
    }

    const profile: Profile = {
      id: record.id,
      name: record.name,
      role: record.role,
      status: record.status,
      createdAt: record.createdAt,
      ...(typeof record.shopId === 'string' ? { shopId: record.shopId } : {}),
      ...(typeof record.phone === 'string' ? { phone: record.phone } : {}),
    };

    const legacyPin =
      typeof record.pin === 'string' && record.pin.trim().length === 4
        ? record.pin.trim()
        : undefined;

    users.push({ user: profile, legacyPin });
  }

  return users;
}

async function persistUsers(users: User[]) {
  try {
    // NEVER write PINs to AsyncStorage. Store only non-sensitive Profile data.
    const nonSensitiveProfiles = users.map((u) => toPublicProfile(u));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nonSensitiveProfiles));
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
        if (parsed && parsed.length > 0) {
          let hadLegacyPlaintextPins = false;
          const hydratedUsers: User[] = [];

          for (const item of parsed) {
            let pin = await getSecureUserPin(item.user.id);

            // Migration: If legacy plaintext PIN exists in AsyncStorage and SecureStore does not have it yet
            if (item.legacyPin) {
              hadLegacyPlaintextPins = true;
              if (!pin) {
                await setSecureUserPin(item.user.id, item.legacyPin);
                const verified = await getSecureUserPin(item.user.id);
                pin = verified === item.legacyPin ? verified : item.legacyPin;
              }
            }

            hydratedUsers.push({
              ...item.user,
              pin: pin || '',
            });
          }

          // If any legacy plaintext PIN was detected, re-persist sanitized profiles
          // to completely eliminate plaintext PINs from AsyncStorage
          if (hadLegacyPlaintextPins) {
            await persistUsers(hydratedUsers);
          }

          emit({
            items: hydratedUsers,
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

export async function setupOwner(input: {
  name: string;
  pin: string;
  id?: string;
  phone?: string;
  shopId?: string;
}): Promise<Profile> {
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

  const ownerId = input.id || `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await setSecureUserPin(ownerId, input.pin);

  const owner: User = {
    id: ownerId,
    name,
    role: 'OWNER',
    status: 'ACTIVE',
    pin: input.pin,
    createdAt: new Date().toISOString(),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.shopId ? { shopId: input.shopId } : {}),
  };

  await commit({
    ...snapshot,
    items: [owner, ...snapshot.items],
  });

  return toPublicProfile(owner);
}

export async function addWorker(input: {
  id?: string;
  name: string;
  pin: string;
  shopId: string;
  phone?: string;
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

  const workerId = input.id?.trim() || createId();
  await setSecureUserPin(workerId, input.pin);

  const existingIndex = snapshot.items.findIndex((item) => item.id === workerId);
  const existing = existingIndex >= 0 ? snapshot.items[existingIndex] : undefined;

  const worker: User = {
    id: workerId,
    name,
    role: 'WORKER',
    status: 'ACTIVE',
    pin: input.pin,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    shopId,
    ...(input.phone?.trim()
      ? { phone: input.phone.trim() }
      : (existing?.phone ? { phone: existing.phone } : {})),
  };

  const items = existingIndex >= 0
    ? snapshot.items.map((user, idx) => (idx === existingIndex ? worker : user))
    : [...snapshot.items, worker];

  await commit({
    ...snapshot,
    items,
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

  await setSecureUserPin(workerId, pin);

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

  await setSecureUserPin(ownerId, newPin);

  const next = { ...user, pin: newPin };
  await replaceUser(next);
  return toPublicProfile(next);
}

export async function upsertWorkerProfiles(
  workers: {
    id: string;
    name: string;
    role: UserRole;
    status: UserStatus;
    shopId: string;
  }[],
  shopId?: string
): Promise<void> {
  const existingMap = new Map(snapshot.items.map((u) => [u.id, u]));
  const incomingIds = new Set(workers.map((w) => w.id));

  // If shopId is provided, local workers for this shop who are absent from the active cloud list
  // (and not un-synced local workers) are updated to INACTIVE to maintain cloud authority
  if (shopId) {
    for (const [id, user] of existingMap.entries()) {
      if (
        user.role === 'WORKER' &&
        user.shopId === shopId &&
        !incomingIds.has(id) &&
        !id.startsWith('worker-')
      ) {
        existingMap.set(id, {
          ...user,
          status: 'INACTIVE',
        });
      }
    }
  }

  for (const w of workers) {
    let existing = existingMap.get(w.id);

    // Backward compatibility: match legacy local worker created with 'worker-' prefix
    if (!existing) {
      const legacyWorker = Array.from(existingMap.values()).find(
        (u) =>
          u.role === 'WORKER' &&
          u.shopId === w.shopId &&
          u.name.toLowerCase() === w.name.toLowerCase() &&
          u.id.startsWith('worker-')
      );
      if (legacyWorker) {
        existing = legacyWorker;
        existingMap.delete(legacyWorker.id);
        if (legacyWorker.pin) {
          await setSecureUserPin(w.id, legacyWorker.pin);
          await deleteSecureUserPin(legacyWorker.id);
        }
      }
    }

    let workerPin = existing ? existing.pin : '';
    if (!workerPin) {
      const storedSecurePin = await getSecureUserPin(w.id);
      if (storedSecurePin) {
        workerPin = storedSecurePin;
      }
    }

    existingMap.set(w.id, {
      id: w.id,
      name: w.name,
      role: w.role,
      status: w.status,
      pin: workerPin,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      shopId: w.shopId,
      ...(existing?.phone ? { phone: existing.phone } : {}),
    });
  }

  await commit({
    ...snapshot,
    items: Array.from(existingMap.values()),
  });
}

export async function cacheAuthenticatedUser(user: {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  pin: string;
  shopId: string;
  phone?: string;
  legacyProfileId?: string;
}): Promise<void> {
  if (user.pin) {
    await setSecureUserPin(user.id, user.pin);
  }
  if (user.legacyProfileId && user.legacyProfileId !== user.id) {
    await deleteSecureUserPin(user.legacyProfileId);
  }

  const existing = snapshot.items.find((u) => u.id === user.id);
  const updatedUser: User = {
    id: user.id,
    name: user.name,
    role: user.role,
    status: user.status,
    pin: user.pin,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    shopId: user.shopId,
    ...(user.phone ? { phone: user.phone } : (existing?.phone ? { phone: existing.phone } : {})),
  };

  const remaining = snapshot.items.filter(
    (u) => u.id !== user.id && (!user.legacyProfileId || u.id !== user.legacyProfileId)
  );
  await commit({
    ...snapshot,
    items: [...remaining, updatedUser],
  });
}

export function useUserStore(): UserSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function removeWorkersForShop(shopId: string): Promise<void> {
  const workersToRemove = snapshot.items.filter((u) => u.shopId === shopId);
  for (const w of workersToRemove) {
    await deleteSecureUserPin(w.id);
  }

  const remaining = snapshot.items.filter((u) => u.shopId !== shopId);
  await commit({
    ...snapshot,
    items: remaining,
  });
}

export async function resetUserStore(): Promise<void> {
  loadPromise = null;
  for (const u of snapshot.items) {
    await deleteSecureUserPin(u.id);
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  emit({
    items: [],
    hydrated: true,
  });
}

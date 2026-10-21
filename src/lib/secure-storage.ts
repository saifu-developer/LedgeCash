import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY_TOKEN = 'cashmanager_auth_token';
const PIN_KEY_PREFIX = 'user_pin_';

// In-memory fallback for platforms where SecureStore is not supported (e.g., SSR / web development)
const memoryFallback = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sanitizes keys to comply with SecureStore requirements:
 * alphanumeric characters, '.', '-', and '_' only.
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Generic secure item getter with web fallback
 */
export async function getSecureItem(key: string): Promise<string | null> {
  const safeKey = sanitizeKey(key);
  const available = await isSecureStoreAvailable();
  if (available) {
    try {
      return await SecureStore.getItemAsync(safeKey);
    } catch {
      return null;
    }
  }
  // Fallback for non-native platforms
  return memoryFallback.get(safeKey) ?? null;
}

/**
 * Generic secure item setter with web fallback
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  const safeKey = sanitizeKey(key);
  const available = await isSecureStoreAvailable();
  if (available) {
    try {
      await SecureStore.setItemAsync(safeKey, value);
      return;
    } catch {
      // Platform error during secure store write
      throw new Error('Failed to securely store credential.');
    }
  }
  memoryFallback.set(safeKey, value);
}

/**
 * Generic secure item remover with web fallback
 */
export async function deleteSecureItem(key: string): Promise<void> {
  const safeKey = sanitizeKey(key);
  const available = await isSecureStoreAvailable();
  if (available) {
    try {
      await SecureStore.deleteItemAsync(safeKey);
    } catch {
      // Non-fatal if key does not exist
    }
  }
  memoryFallback.delete(safeKey);
}

/* ====================================================================
   JWT TOKEN SECURE STORAGE & MIGRATION
   ==================================================================== */

/**
 * Retrieves the JWT auth token from SecureStore, performing a transparent
 * one-time migration from legacy AsyncStorage if necessary.
 */
export async function getSecureAuthToken(): Promise<string | null> {
  // 1. Try reading from SecureStore
  const token = await getSecureItem(STORAGE_KEY_TOKEN);
  if (token) {
    return token;
  }

  // 2. Migration: Check if a legacy token exists in plaintext AsyncStorage
  try {
    const legacyToken = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
    if (legacyToken) {
      // Safely move to SecureStore
      await setSecureItem(STORAGE_KEY_TOKEN, legacyToken);

      // Verify migration succeeded before removing legacy plaintext value
      const verified = await getSecureItem(STORAGE_KEY_TOKEN);
      if (verified === legacyToken) {
        await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
      }
      return legacyToken;
    }
  } catch {
    // If migration check encounters storage issue, proceed without breaking
  }

  return null;
}

/**
 * Saves or deletes the JWT auth token securely.
 * Also removes any legacy AsyncStorage key to ensure no plaintext token remains.
 */
export async function setSecureAuthToken(token: string | null): Promise<void> {
  if (token) {
    await setSecureItem(STORAGE_KEY_TOKEN, token);
  } else {
    await deleteSecureItem(STORAGE_KEY_TOKEN);
  }

  // Ensure legacy plaintext token is never left behind
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
  } catch {
    // Ignore cleanup error
  }
}

/* ====================================================================
   USER PIN SECURE STORAGE & MIGRATION
   ==================================================================== */

export function getUserPinKey(userId: string): string {
  return `${PIN_KEY_PREFIX}${sanitizeKey(userId)}`;
}

/**
 * Retrieves a user's PIN from SecureStore.
 */
export async function getSecureUserPin(userId: string): Promise<string | null> {
  if (!userId) return null;
  return getSecureItem(getUserPinKey(userId));
}

/**
 * Securely stores a user's PIN.
 */
export async function setSecureUserPin(userId: string, pin: string): Promise<void> {
  if (!userId || !pin) return;
  await setSecureItem(getUserPinKey(userId), pin);
}

/**
 * Securely deletes a user's PIN (e.g., worker removal or app reset).
 */
export async function deleteSecureUserPin(userId: string): Promise<void> {
  if (!userId) return;
  await deleteSecureItem(getUserPinKey(userId));
}

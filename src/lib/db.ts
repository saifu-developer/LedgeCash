import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import {
  CURRENT_DATABASE_VERSION,
  generateShopId,
  generateUniqueShopIdInDb,
  getDatabaseVersion,
  runMigrations,
  type StoredUser,
  type UserStorage,
} from '@/lib/migrations';

export {
  CURRENT_DATABASE_VERSION,
  generateShopId,
  generateUniqueShopIdInDb,
  getDatabaseVersion,
  runMigrations,
};

const asyncStorageUserStorage: UserStorage = {
  getUsers: async () => {
    try {
      const raw = await AsyncStorage.getItem('cashmanager_users');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed as StoredUser[];
        }
      }
    } catch {
      // Ignored
    }
    return [];
  },
  saveUsers: async (users: StoredUser[]) => {
    try {
      await AsyncStorage.setItem('cashmanager_users', JSON.stringify(users));
    } catch {
      // Ignored
    }
  },
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('cashmanager.db');

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);

    await runMigrations(db, asyncStorageUserStorage);

    return db;
  })();

  return dbPromise;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    return initDatabase();
  }
  return dbPromise;
}

export function resetDatabasePromiseForTesting(): void {
  dbPromise = null;
}

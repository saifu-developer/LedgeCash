import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('cashmanager.db');

    // Create tables if they don't exist
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        createdAt TEXT NOT NULL,
        createdById TEXT NOT NULL,
        createdByName TEXT NOT NULL,
        category TEXT,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions (createdAt DESC);

      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY NOT NULL,
        action TEXT NOT NULL,
        transactionId TEXT NOT NULL,
        originalAmount REAL,
        newAmount REAL,
        originalType TEXT NOT NULL,
        createdById TEXT NOT NULL,
        createdByName TEXT NOT NULL,
        correctedById TEXT NOT NULL,
        correctedByName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        category TEXT,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_createdAt ON audit (createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_transactionId ON audit (transactionId);

      PRAGMA user_version = 1;
    `);

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

export const CURRENT_DATABASE_VERSION = 3;
export const DEMO_SHOP_ID = 'LC-DEMO01';
export const DEMO_OWNER_ID = 'owner-irfan-ali';

export interface SqliteDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: any[]): Promise<any>;
  getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface StoredUser {
  id: string;
  name: string;
  role: string;
  status: string;
  shopId?: string;
}

export interface UserStorage {
  getUsers(): Promise<StoredUser[]>;
  saveUsers(users: StoredUser[]): Promise<void>;
}

export function generateShopId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = 'LC-';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function generateUniqueShopIdInDb(db: SqliteDb): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = generateShopId();
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

export async function getDatabaseVersion(db: SqliteDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

export async function migrateToV2(
  db: SqliteDb,
  userStorage?: UserStorage
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // 1. Ensure shops table exists
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shops_ownerId ON shops (ownerId);
    `);

    // 2. Count existing records in transactions and audit
    const txCountRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions'
    );
    const auditCountRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM audit'
    );
    const txCount = txCountRow?.count ?? 0;
    const auditCount = auditCountRow?.count ?? 0;

    let users: StoredUser[] = [];
    if (userStorage) {
      try {
        users = await userStorage.getUsers();
      } catch {
        users = [];
      }
    }

    const realOwners = users.filter((u) => u.role === 'OWNER');

    // 3. Check for legacy records and determine attribution
    let realOwnerShopId: string | null = null;

    if (txCount > 0 || auditCount > 0) {
      // Check if transactions are solely demo records
      const nonDemoTx = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM transactions WHERE createdById != ? AND createdById NOT IN ('worker-placeholder-1', 'worker-placeholder-2')`,
        [DEMO_OWNER_ID]
      );
      const hasRealTransactions = (nonDemoTx?.count ?? 0) > 0;

      if (hasRealTransactions) {
        if (realOwners.length === 0) {
          throw new Error(
            'Migration ambiguity: Legacy transactions exist, but no Owner account was found to attribute them to.'
          );
        }
        if (realOwners.length > 1) {
          throw new Error(
            'Migration ambiguity: Multiple Owner accounts found. Cannot safely attribute legacy records to a specific Owner.'
          );
        }
      }
    }

    // If there is exactly one real owner, create/find their shop
    if (realOwners.length === 1) {
      const owner = realOwners[0];
      const existingShop = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM shops WHERE ownerId = ?',
        [owner.id]
      );

      if (existingShop) {
        realOwnerShopId = existingShop.id;
      } else {
        realOwnerShopId = await generateUniqueShopIdInDb(db);
        const shopName = `${owner.name}'s Shop`;
        const createdAt = new Date().toISOString();
        await db.runAsync(
          'INSERT INTO shops (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)',
          [realOwnerShopId, shopName, owner.id, createdAt]
        );
      }

      // Assign existing workers to the owner's shop
      if (userStorage) {
        let usersChanged = false;
        for (const user of users) {
          if (user.role === 'WORKER' && !user.shopId) {
            user.shopId = realOwnerShopId;
            usersChanged = true;
          }
        }
        if (usersChanged) {
          await userStorage.saveUsers(users);
        }
      }
    }

    // 4. Ensure shopId column exists in transactions
    const txCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions);');
    const hasTxShopId = txCols.some((col) => col.name === 'shopId');
    if (!hasTxShopId) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN shopId TEXT;');
    }

    // Backfill demo records to DEMO_SHOP_ID only if demo users are present
    const demoTxCount = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM transactions WHERE createdById = ? OR createdById IN ('worker-placeholder-1', 'worker-placeholder-2')`,
      [DEMO_OWNER_ID]
    );
    if ((demoTxCount?.count ?? 0) > 0) {
      await db.runAsync(
        'INSERT OR IGNORE INTO shops (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)',
        [DEMO_SHOP_ID, 'Demo Shop', DEMO_OWNER_ID, new Date().toISOString()]
      );
      await db.runAsync(
        `UPDATE transactions SET shopId = ? WHERE (shopId IS NULL OR shopId = '') AND (createdById = ? OR createdById IN ('worker-placeholder-1', 'worker-placeholder-2'))`,
        [DEMO_SHOP_ID, DEMO_OWNER_ID]
      );
    }

    // Backfill real records to the real owner's shop
    if (realOwnerShopId) {
      await db.runAsync(
        'UPDATE transactions SET shopId = ? WHERE shopId IS NULL OR shopId = ?',
        [realOwnerShopId, '']
      );
    }

    // 5. Ensure shopId column exists in audit
    const auditCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(audit);');
    const hasAuditShopId = auditCols.some((col) => col.name === 'shopId');
    if (!hasAuditShopId) {
      await db.execAsync('ALTER TABLE audit ADD COLUMN shopId TEXT;');
    }
    if (realOwnerShopId) {
      await db.runAsync(
        'UPDATE audit SET shopId = ? WHERE shopId IS NULL OR shopId = ?',
        [realOwnerShopId, '']
      );
    }

    // 6. Ensure indexes exist
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions (createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_shopId ON transactions (shopId);
      CREATE INDEX IF NOT EXISTS idx_transactions_shop_created ON transactions (shopId, createdAt DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_createdAt ON audit (createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_transactionId ON audit (transactionId);
      CREATE INDEX IF NOT EXISTS idx_audit_shopId ON audit (shopId);
      CREATE INDEX IF NOT EXISTS idx_audit_shop_created ON audit (shopId, createdAt DESC);

      PRAGMA user_version = 2;
    `);
  });
}

export async function migrateToV3(db: SqliteDb): Promise<void> {
  await db.withTransactionAsync(async () => {
    // 1. Add sync columns to transactions if not existing
    const txCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions);');
    const hasSyncStatus = txCols.some((col) => col.name === 'syncStatus');
    if (!hasSyncStatus) {
      await db.execAsync("ALTER TABLE transactions ADD COLUMN syncStatus TEXT DEFAULT 'SYNCED';");
    }

    const hasUpdatedAt = txCols.some((col) => col.name === 'updatedAt');
    if (!hasUpdatedAt) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN updatedAt TEXT;');
    }

    const hasIsDeleted = txCols.some((col) => col.name === 'isDeleted');
    if (!hasIsDeleted) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN isDeleted INTEGER DEFAULT 0;');
    }

    // 2. Create sync_meta table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_sync ON transactions (shopId, syncStatus);
      PRAGMA user_version = 3;
    `);
  });
}

export async function initializeFreshV3(db: SqliteDb): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shops_ownerId ON shops (ownerId);

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        shopId TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        createdAt TEXT NOT NULL,
        createdById TEXT NOT NULL,
        createdByName TEXT NOT NULL,
        category TEXT,
        description TEXT,
        syncStatus TEXT DEFAULT 'SYNCED',
        updatedAt TEXT,
        isDeleted INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions (createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_shopId ON transactions (shopId);
      CREATE INDEX IF NOT EXISTS idx_transactions_shop_created ON transactions (shopId, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_sync ON transactions (shopId, syncStatus);

      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY NOT NULL,
        shopId TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_audit_shopId ON audit (shopId);
      CREATE INDEX IF NOT EXISTS idx_audit_shop_created ON audit (shopId, createdAt DESC);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );

      PRAGMA user_version = 3;
    `);
  });
}

export async function runMigrations(
  db: SqliteDb,
  userStorage?: UserStorage
): Promise<void> {
  let version = await getDatabaseVersion(db);

  if (version === 0) {
    const txTable = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions';"
    );
    if (!txTable) {
      await initializeFreshV3(db);
      return;
    }
    await migrateToV2(db, userStorage);
    version = 2;
  }

  if (version === 1) {
    await migrateToV2(db, userStorage);
    version = 2;
  }

  if (version === 2) {
    await migrateToV3(db);
    return;
  }

  if (version > CURRENT_DATABASE_VERSION) {
    console.warn(
      `Database version (${version}) is higher than application version (${CURRENT_DATABASE_VERSION}).`
    );
  }
}

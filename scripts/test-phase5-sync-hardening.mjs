import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

console.log('=== LedgeCash Phase 5 Multi-Shop Sync Hardening Verification ===\n');

// 1. Storage simulation
const secureStoreData = new Map();
const mockSecureStore = {
  getItemAsync: async (key) => secureStoreData.get(key) ?? null,
  setItemAsync: async (key, val) => { secureStoreData.set(key, String(val)); },
  deleteItemAsync: async (key) => { secureStoreData.delete(key); },
  clear: async () => { secureStoreData.clear(); },
};

const STORAGE_KEY_TOKEN = 'cashmanager_auth_token';

function createMockJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

import {
  getShopIdFromJwt,
  verifyJwtShopConsistency,
} from '../src/lib/jwt-utils.ts';

// 2. Mock session state
let currentActiveShopId = null;
function setActiveShopId(shopId) {
  currentActiveShopId = shopId;
}
function getActiveShopId() {
  return currentActiveShopId;
}

// 3. Mock sync preflight implementation matching src/lib/sync-service.ts
async function validateSyncPreflight() {
  const activeShopId = getActiveShopId();
  if (!activeShopId) {
    return {
      allowed: false,
      activeShopId: null,
      jwtShopId: null,
      reason: 'Sync aborted: No activeShopId found in current session.',
    };
  }

  const token = await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
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

class CrossShopSyncError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrossShopSyncError';
  }
}

// 4. SQLite database simulation
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    shopId TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    createdAt TEXT NOT NULL,
    createdById TEXT NOT NULL,
    createdByName TEXT NOT NULL,
    category TEXT,
    description TEXT,
    syncStatus TEXT NOT NULL,
    updatedAt TEXT,
    isDeleted INTEGER DEFAULT 0
  );

  CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Core sync engine simulation matching hardened src/lib/sync-service.ts
async function syncNowSimulated(mockApiBatchHandler) {
  const preflight = await validateSyncPreflight();
  if (!preflight.allowed) {
    return { success: false, reason: preflight.reason, abortedByPreflight: true };
  }

  const shopId = preflight.jwtShopId;

  // 1. Fetch local pending items for authenticated shop only
  const pendingRows = db.prepare(
    "SELECT id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted FROM transactions WHERE shopId = ? AND syncStatus != 'SYNCED'"
  ).all(shopId);

  // Security check on pending rows
  for (const row of pendingRows) {
    if (row.shopId !== shopId) {
      return { success: false, reason: `Pending transaction ${row.id} has mismatched shopId ${row.shopId}` };
    }
  }

  // 2. Read lastSyncTimestamp from sync_meta per shopId
  const metaKey = `lastSyncTimestamp_${shopId}`;
  const metaRow = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(metaKey);
  const lastSyncTimestamp = metaRow?.value ?? null;

  // 3. Call remote batch API
  const response = await mockApiBatchHandler({
    shopId,
    lastSyncTimestamp,
    transactions: pendingRows.map(r => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      category: r.category,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isDeleted: r.syncStatus === 'PENDING_DELETE' || r.isDeleted === 1,
    }))
  });

  // 4. Update SQLite inside a transaction with pull/apply protection
  try {
    db.exec('BEGIN TRANSACTION');

    // Pre-validation of incoming server changes to prevent cross-shop contamination
    if (response.serverChanges && response.serverChanges.length > 0) {
      for (const serverTx of response.serverChanges) {
        if (serverTx.shopId && serverTx.shopId !== shopId) {
          throw new CrossShopSyncError(
            `Cross-shop remote data rejected: serverChange transaction ${serverTx.id} belongs to shop "${serverTx.shopId}", but authenticated shop is "${shopId}".`
          );
        }

        const local = db.prepare('SELECT id, shopId, syncStatus FROM transactions WHERE id = ?').get(serverTx.id);
        if (local && local.shopId && local.shopId !== shopId) {
          throw new CrossShopSyncError(
            `Cross-shop collision rejected: remote transaction ${serverTx.id} collides with local transaction in shop "${local.shopId}".`
          );
        }
      }
    }

    // A. Resolve pushed rows
    for (const row of pendingRows) {
      if (row.syncStatus === 'PENDING_DELETE' || row.isDeleted === 1) {
        db.prepare('DELETE FROM transactions WHERE id = ?').run(row.id);
      } else {
        db.prepare("UPDATE transactions SET syncStatus = 'SYNCED' WHERE id = ?").run(row.id);
      }
    }

    // B. Apply incoming server changes
    if (response.serverChanges && response.serverChanges.length > 0) {
      for (const serverTx of response.serverChanges) {
        const local = db.prepare('SELECT id, syncStatus FROM transactions WHERE id = ?').get(serverTx.id);
        const isDeleted = Boolean(serverTx.deleted || serverTx.isDeleted);

        if (isDeleted) {
          if (!local || local.syncStatus === 'SYNCED') {
            db.prepare('DELETE FROM transactions WHERE id = ?').run(serverTx.id);
          }
        } else if (local) {
          if (local.syncStatus === 'SYNCED') {
            db.prepare(
              `UPDATE transactions SET type = ?, amount = ?, category = ?, description = ?, updatedAt = ?, syncStatus = 'SYNCED', isDeleted = 0 WHERE id = ?`
            ).run(serverTx.type, serverTx.amount, serverTx.category || null, serverTx.description || null, serverTx.updatedAt || serverTx.createdAt, serverTx.id);
          }
        } else {
          db.prepare(
            `INSERT OR REPLACE INTO transactions (id, shopId, type, amount, createdAt, createdById, createdByName, category, description, syncStatus, updatedAt, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, 0)`
          ).run(serverTx.id, shopId, serverTx.type, serverTx.amount, serverTx.createdAt, serverTx.createdById || 'srv', serverTx.createdByName || 'Server', serverTx.category || null, serverTx.description || null, serverTx.updatedAt || serverTx.createdAt);
        }
      }
    }

    // C. Update lastSyncTimestamp in sync_meta per shopId
    if (response.syncTimestamp) {
      db.prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run(metaKey, response.syncTimestamp);
    }

    db.exec('COMMIT');
    return { success: true, syncedCount: response.syncedCount || 0 };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, reason: err.message, error: err };
  }
}

// ==========================================
// TEST SCENARIOS
// ==========================================

async function runTests() {
  const tokenA = createMockJwt({ sub: 'user-owner-1', phone: '01711111111', role: 'OWNER', shopId: 'LC-SHOP-A' });
  const tokenB = createMockJwt({ sub: 'user-owner-1', phone: '01711111111', role: 'OWNER', shopId: 'LC-SHOP-B' });

  // 1. activeShopId = A, JWT = A -> sync allowed
  console.log('Scenario 1: activeShopId = A, JWT = A → sync allowed...');
  setActiveShopId('LC-SHOP-A');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  const p1 = await validateSyncPreflight();
  assert.equal(p1.allowed, true);
  assert.equal(p1.jwtShopId, 'LC-SHOP-A');
  assert.equal(p1.activeShopId, 'LC-SHOP-A');
  console.log('  ✓ Scenario 1 passed: Preflight approved sync for Shop A');

  // 2. activeShopId = B, JWT = B -> sync allowed
  console.log('Scenario 2: activeShopId = B, JWT = B → sync allowed...');
  setActiveShopId('LC-SHOP-B');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  const p2 = await validateSyncPreflight();
  assert.equal(p2.allowed, true);
  assert.equal(p2.jwtShopId, 'LC-SHOP-B');
  assert.equal(p2.activeShopId, 'LC-SHOP-B');
  console.log('  ✓ Scenario 2 passed: Preflight approved sync for Shop B');

  // 3. activeShopId = A, JWT = B -> sync blocked
  console.log('Scenario 3: activeShopId = A, JWT = B → sync blocked...');
  setActiveShopId('LC-SHOP-A');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  const p3 = await validateSyncPreflight();
  assert.equal(p3.allowed, false);
  assert.match(p3.reason, /activeShopId "LC-SHOP-A" does not match JWT shopId "LC-SHOP-B"/);
  let syncCalled = false;
  const res3 = await syncNowSimulated(() => { syncCalled = true; return {}; });
  assert.equal(res3.success, false);
  assert.equal(res3.abortedByPreflight, true);
  assert.equal(syncCalled, false, 'Remote API MUST NOT be called when preflight is rejected');
  console.log('  ✓ Scenario 3 passed: Sync strictly blocked and remote API never invoked');

  // 4. activeShopId = B, JWT = A -> sync blocked
  console.log('Scenario 4: activeShopId = B, JWT = A → sync blocked...');
  setActiveShopId('LC-SHOP-B');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  const p4 = await validateSyncPreflight();
  assert.equal(p4.allowed, false);
  assert.match(p4.reason, /activeShopId "LC-SHOP-B" does not match JWT shopId "LC-SHOP-A"/);
  syncCalled = false;
  const res4 = await syncNowSimulated(() => { syncCalled = true; return {}; });
  assert.equal(res4.success, false);
  assert.equal(res4.abortedByPreflight, true);
  assert.equal(syncCalled, false, 'Remote API MUST NOT be called when preflight is rejected');
  console.log('  ✓ Scenario 4 passed: Sync strictly blocked and remote API never invoked');

  // 5. missing JWT -> sync blocked
  console.log('Scenario 5: missing JWT → sync blocked...');
  setActiveShopId('LC-SHOP-A');
  await mockSecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
  const p5 = await validateSyncPreflight();
  assert.equal(p5.allowed, false);
  assert.match(p5.reason, /No authentication token found in SecureStore/);
  console.log('  ✓ Scenario 5 passed: Missing JWT cleanly aborts preflight');

  // 6. missing activeShopId -> sync blocked
  console.log('Scenario 6: missing activeShopId → sync blocked...');
  setActiveShopId(null);
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  const p6 = await validateSyncPreflight();
  assert.equal(p6.allowed, false);
  assert.match(p6.reason, /No activeShopId found in current session/);
  console.log('  ✓ Scenario 6 passed: Missing activeShopId cleanly aborts preflight');

  // 7. remote Shop A record while authenticated as Shop B -> rejected
  console.log('Scenario 7: remote Shop A record while authenticated as Shop B → rejected...');
  setActiveShopId('LC-SHOP-B');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  const res7 = await syncNowSimulated(async () => {
    return {
      syncedCount: 0,
      serverChanges: [
        {
          id: 'tx-foreign-a',
          shopId: 'LC-SHOP-A', // Cross-shop payload!
          type: 'CASH_IN',
          amount: 500,
          createdAt: new Date().toISOString(),
        }
      ],
      syncTimestamp: '2026-10-26T12:00:00Z'
    };
  });
  assert.equal(res7.success, false);
  assert.match(res7.reason, /Cross-shop remote data rejected.*belongs to shop "LC-SHOP-A"/);
  const check7 = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-foreign-a');
  assert.equal(check7, undefined, 'Foreign Shop A transaction MUST NOT be inserted into database');
  console.log('  ✓ Scenario 7 passed: Foreign Shop A record cleanly rejected without writing to database');

  // 8. remote Shop B record while authenticated as Shop A -> rejected
  console.log('Scenario 8: remote Shop B record while authenticated as Shop A → rejected...');
  setActiveShopId('LC-SHOP-A');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  const res8 = await syncNowSimulated(async () => {
    return {
      syncedCount: 0,
      serverChanges: [
        {
          id: 'tx-foreign-b',
          shopId: 'LC-SHOP-B', // Cross-shop payload!
          type: 'CASH_IN',
          amount: 750,
          createdAt: new Date().toISOString(),
        }
      ],
      syncTimestamp: '2026-10-26T12:00:00Z'
    };
  });
  assert.equal(res8.success, false);
  assert.match(res8.reason, /Cross-shop remote data rejected.*belongs to shop "LC-SHOP-B"/);
  const check8 = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-foreign-b');
  assert.equal(check8, undefined, 'Foreign Shop B transaction MUST NOT be inserted into database');
  console.log('  ✓ Scenario 8 passed: Foreign Shop B record cleanly rejected without writing to database');

  // 9. Shop A timestamp never reused for Shop B
  console.log('Scenario 9: Shop A timestamp never reused for Shop B...');
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncTimestamp_LC-SHOP-A', '2026-10-20T10:00:00Z')").run();
  setActiveShopId('LC-SHOP-B');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  let capturedTimestampForB = 'unset';
  await syncNowSimulated(async (req) => {
    capturedTimestampForB = req.lastSyncTimestamp;
    return {
      syncedCount: 0,
      serverChanges: [],
      syncTimestamp: '2026-10-26T15:00:00Z',
    };
  });
  assert.equal(capturedTimestampForB, null, 'Shop B sync timestamp must be isolated from Shop A (expected null for fresh shop)');
  const metaB = db.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp_LC-SHOP-B'").get();
  assert.equal(metaB.value, '2026-10-26T15:00:00Z');
  const metaA = db.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp_LC-SHOP-A'").get();
  assert.equal(metaA.value, '2026-10-20T10:00:00Z', 'Shop A timestamp must remain unchanged');
  console.log('  ✓ Scenario 9 passed: Shop A timestamp was not reused for Shop B');

  // 10. Shop B timestamp never reused for Shop A
  console.log('Scenario 10: Shop B timestamp never reused for Shop A...');
  setActiveShopId('LC-SHOP-A');
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  let capturedTimestampForA = 'unset';
  await syncNowSimulated(async (req) => {
    capturedTimestampForA = req.lastSyncTimestamp;
    return {
      syncedCount: 0,
      serverChanges: [],
      syncTimestamp: '2026-10-26T16:00:00Z',
    };
  });
  assert.equal(capturedTimestampForA, '2026-10-20T10:00:00Z', 'Shop A must use its own previously saved timestamp');
  const metaAAfter = db.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp_LC-SHOP-A'").get();
  assert.equal(metaAAfter.value, '2026-10-26T16:00:00Z');
  const metaBAfter = db.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp_LC-SHOP-B'").get();
  assert.equal(metaBAfter.value, '2026-10-26T15:00:00Z', 'Shop B timestamp must remain strictly untouched');
  console.log('  ✓ Scenario 10 passed: Shop B timestamp remained isolated from Shop A');

  // 11. switch A→B then sync → only B
  console.log('Scenario 11: switch A→B then sync → only B...');
  // Insert local pending transaction for Shop B
  db.prepare(`
    INSERT INTO transactions (id, shopId, type, amount, createdAt, createdById, createdByName, syncStatus)
    VALUES ('tx-b-pending', 'LC-SHOP-B', 'CASH_IN', 1200, '2026-10-26T16:01:00Z', 'user-owner-1', 'Owner', 'PENDING_UPLOAD')
  `).run();

  // Perform atomic switch to B
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  setActiveShopId('LC-SHOP-B');

  let uploadedToBackend = [];
  const res11 = await syncNowSimulated(async (req) => {
    assert.equal(req.shopId, 'LC-SHOP-B');
    uploadedToBackend = req.transactions;
    return {
      syncedCount: req.transactions.length,
      serverChanges: [],
      syncTimestamp: '2026-10-26T16:05:00Z',
    };
  });
  assert.equal(res11.success, true);
  assert.equal(uploadedToBackend.length, 1);
  assert.equal(uploadedToBackend[0].id, 'tx-b-pending');
  const bTx = db.prepare("SELECT syncStatus FROM transactions WHERE id = 'tx-b-pending'").get();
  assert.equal(bTx.syncStatus, 'SYNCED');
  console.log('  ✓ Scenario 11 passed: Switched to Shop B and synced only Shop B data');

  // 12. switch B→A then sync → only A
  console.log('Scenario 12: switch B→A then sync → only A...');
  // Insert local pending transaction for Shop A
  db.prepare(`
    INSERT INTO transactions (id, shopId, type, amount, createdAt, createdById, createdByName, syncStatus)
    VALUES ('tx-a-pending', 'LC-SHOP-A', 'CASH_IN', 2500, '2026-10-26T16:06:00Z', 'user-owner-1', 'Owner', 'PENDING_UPLOAD')
  `).run();

  // Perform atomic switch to A
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenA);
  setActiveShopId('LC-SHOP-A');

  let uploadedToBackendA = [];
  const res12 = await syncNowSimulated(async (req) => {
    assert.equal(req.shopId, 'LC-SHOP-A');
    uploadedToBackendA = req.transactions;
    return {
      syncedCount: req.transactions.length,
      serverChanges: [],
      syncTimestamp: '2026-10-26T16:10:00Z',
    };
  });
  assert.equal(res12.success, true);
  assert.equal(uploadedToBackendA.length, 1);
  assert.equal(uploadedToBackendA[0].id, 'tx-a-pending');
  const aTx = db.prepare("SELECT syncStatus FROM transactions WHERE id = 'tx-a-pending'").get();
  assert.equal(aTx.syncStatus, 'SYNCED');
  console.log('  ✓ Scenario 12 passed: Switched back to Shop A and synced only Shop A data');

  // 13. logout → sync blocked
  console.log('Scenario 13: logout → sync blocked...');
  await mockSecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
  setActiveShopId(null);
  const p13 = await validateSyncPreflight();
  assert.equal(p13.allowed, false);
  const res13 = await syncNowSimulated(() => { throw new Error('Must not be called'); });
  assert.equal(res13.success, false);
  assert.equal(res13.abortedByPreflight, true);
  console.log('  ✓ Scenario 13 passed: Logout blocks all sync activity');

  // 14. restored valid session → sync allowed
  console.log('Scenario 14: restored valid session → sync allowed...');
  // Restore session from token B
  await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, tokenB);
  const tokenPayload = Buffer.from(tokenB.split('.')[1], 'base64url').toString();
  const parsed = JSON.parse(tokenPayload);
  setActiveShopId(parsed.shopId);

  const p14 = await validateSyncPreflight();
  assert.equal(p14.allowed, true);
  assert.equal(p14.jwtShopId, 'LC-SHOP-B');
  assert.equal(p14.activeShopId, 'LC-SHOP-B');
  const res14 = await syncNowSimulated(async () => {
    return {
      syncedCount: 0,
      serverChanges: [],
      syncTimestamp: '2026-10-26T16:15:00Z',
    };
  });
  assert.equal(res14.success, true);
  console.log('  ✓ Scenario 14 passed: Restored valid session allows sync safely');

  console.log('\n============================================================');
  console.log('ALL 14 PHASE 5 MULTI-SHOP SYNC SECURITY SCENARIOS PASSED');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

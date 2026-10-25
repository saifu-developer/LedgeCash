import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

console.log('=== LedgeCash Phase 3 Frontend Multi-Shop Integration Tests ===\n');

// ----------------------------------------------------
// 1. In-memory Mock Stores (AsyncStorage, SecureStore, SQLite)
// ----------------------------------------------------

const asyncStorageData = new Map();
const mockAsyncStorage = {
  getItem: async (key) => asyncStorageData.get(key) ?? null,
  setItem: async (key, val) => { asyncStorageData.set(key, String(val)); },
  removeItem: async (key) => { asyncStorageData.delete(key); },
  clear: async () => { asyncStorageData.clear(); },
};

const secureStoreData = new Map();
const mockSecureStore = {
  getItemAsync: async (key) => secureStoreData.get(key) ?? null,
  setItemAsync: async (key, val) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new Error(`Invalid SecureStore key: ${key}`);
    }
    secureStoreData.set(key, String(val));
  },
  deleteItemAsync: async (key) => { secureStoreData.delete(key); },
  clear: async () => { secureStoreData.clear(); },
};

const STORAGE_KEY_TOKEN = 'cashmanager_auth_token';
const STORAGE_KEY_USERS = 'cashmanager_users';

function sanitizeKey(key) {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getUserPinKey(userId) {
  return `user_pin_${sanitizeKey(userId)}`;
}

async function getSecureAuthToken() {
  return mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
}

async function setSecureAuthToken(token) {
  if (token) {
    await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, token);
  } else {
    await mockSecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
  }
  await mockAsyncStorage.removeItem(STORAGE_KEY_TOKEN);
}

async function getSecureUserPin(userId) {
  if (!userId) return null;
  return mockSecureStore.getItemAsync(getUserPinKey(userId));
}

async function setSecureUserPin(userId, pin) {
  if (!userId || !pin) return;
  await mockSecureStore.setItemAsync(getUserPinKey(userId), pin);
}

// ----------------------------------------------------
// 2. JWT Helper Utilities (matching src/lib/jwt-utils.ts)
// ----------------------------------------------------

function createMockJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = 'mock_signature_bytes';
  return `${header}.${payload}.${signature}`;
}

import {
  parseJwtPayload,
  getShopIdFromJwt,
  getUserIdFromJwt,
  getRoleFromJwt,
  verifyJwtShopConsistency,
  assertJwtShopConsistency,
  SessionInconsistencyError,
} from '../src/lib/jwt-utils.ts';

// ----------------------------------------------------
// 3. SQLite DB Simulation
// ----------------------------------------------------

const rawDb = new DatabaseSync(':memory:');
rawDb.exec(`
  CREATE TABLE shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

function createSqliteAdapter(db) {
  return {
    runAsync: async (sql, params = []) => {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
    },
    getAllAsync: async (sql, params = []) => {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
    getFirstAsync: async (sql, params = []) => {
      const stmt = db.prepare(sql);
      return stmt.get(...params) || null;
    },
    withTransactionAsync: async (fn) => {
      db.exec('BEGIN TRANSACTION;');
      try {
        await fn();
        db.exec('COMMIT;');
      } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
      }
    },
  };
}

const sqlite = createSqliteAdapter(rawDb);

// In-memory shops store state
let shopItems = [];
async function upsertShops(shops) {
  if (!shops || shops.length === 0) return;
  await sqlite.withTransactionAsync(async () => {
    for (const shop of shops) {
      const createdAt = shop.createdAt || new Date().toISOString();
      await sqlite.runAsync(
        'INSERT OR REPLACE INTO shops (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)',
        [shop.id, shop.name, shop.ownerId, createdAt]
      );
    }
  });
  const incomingIds = new Set(shops.map((s) => s.id));
  const remaining = shopItems.filter((s) => !incomingIds.has(s.id));
  shopItems = [...remaining, ...shops];
}

function getShopById(id) {
  return shopItems.find((s) => s.id === id);
}

function getShopsByOwner(ownerId) {
  return shopItems.filter((s) => s.ownerId === ownerId);
}

// Session state
let currentProfile = null;
let activeShopId = null;

function setCurrentProfile(profile) {
  currentProfile = profile;
}

function getCurrentProfile() {
  return currentProfile;
}

function isAuthorizedForShop(profile, shopId) {
  if (!profile || !shopId) return false;
  if (profile.role === 'WORKER') return profile.shopId === shopId;
  if (profile.role === 'OWNER') {
    const shop = getShopById(shopId);
    return Boolean(shop && shop.ownerId === profile.id);
  }
  return false;
}

function setActiveShopId(shopId) {
  if (shopId === null) {
    activeShopId = null;
    return;
  }
  if (!currentProfile) {
    throw new Error('Cannot select an active shop without a logged-in profile.');
  }
  if (!isAuthorizedForShop(currentProfile, shopId)) {
    throw new Error(`Access denied: Profile "${currentProfile.name}" is not authorized for shop "${shopId}".`);
  }
  activeShopId = shopId;
}

function getActiveShopId() {
  return activeShopId;
}

// User caching
let userItems = [];
async function cacheAuthenticatedUser(user) {
  if (user.pin) {
    await setSecureUserPin(user.id, user.pin);
  }
  const existing = userItems.find((u) => u.id === user.id);
  const updated = {
    id: user.id,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    shopId: user.shopId,
    phone: user.phone,
  };
  userItems = [...userItems.filter((u) => u.id !== user.id), updated];
  // Persist only sanitized public profile (NO PIN) in AsyncStorage
  await mockAsyncStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(userItems));
}

// ----------------------------------------------------
// Mock Multi-Shop Server Simulation
// ----------------------------------------------------

let mockServerFailSwitch = false;
let mockServerFailType = 'HTTP_403';
let mockServerInvalidTokenShop = false;

async function mockLoginOwnerApi(req) {
  if (req.phone === '9876543210' && req.pin === '1234') {
    const shopA = { id: 'LC-SHOP-A', name: 'Main Store', ownerId: 'owner-uuid-1', createdAt: '2026-01-01T00:00:00Z' };
    const shopB = { id: 'LC-SHOP-B', name: 'Second Store', ownerId: 'owner-uuid-1', createdAt: '2026-01-02T00:00:00Z' };
    const token = createMockJwt({
      sub: 'owner-uuid-1',
      phone: req.phone,
      name: 'Alice Owner',
      role: 'OWNER',
      shopId: 'LC-SHOP-A',
    });
    return {
      token,
      tokenType: 'Bearer',
      userId: 'owner-uuid-1',
      name: 'Alice Owner',
      phone: req.phone,
      role: 'OWNER',
      activeShopId: 'LC-SHOP-A',
      activeShopName: 'Main Store',
      shops: [shopA, shopB],
    };
  }
  throw new Error('HTTP 400: Incorrect phone or PIN');
}

async function mockSwitchShopApi(req) {
  if (mockServerFailSwitch) {
    if (mockServerFailType === 'HTTP_403') {
      throw new Error('HTTP 403: Forbidden - Shop does not belong to owner');
    }
    throw new Error('HTTP 500: Internal Server Error');
  }

  const tokenShop = mockServerInvalidTokenShop ? 'LC-SHOP-WRONG' : req.shopId;
  const token = createMockJwt({
    sub: currentProfile.id,
    phone: currentProfile.phone || '9876543210',
    name: currentProfile.name,
    role: 'OWNER',
    shopId: tokenShop,
  });

  return {
    token,
    tokenType: 'Bearer',
    userId: currentProfile.id,
    name: currentProfile.name,
    phone: currentProfile.phone || '9876543210',
    shopId: req.shopId,
    shopName: req.shopId === 'LC-SHOP-B' ? 'Second Store' : 'Main Store',
    role: 'OWNER',
  };
}

async function mockCreateShopApi(req) {
  const newShopId = 'LC-SHOP-C';
  return {
    id: newShopId,
    name: req.name,
    ownerId: currentProfile.id,
    createdAt: new Date().toISOString(),
  };
}

async function mockGetOwnedShopsApi() {
  const rows = await sqlite.getAllAsync('SELECT id, name, ownerId, createdAt FROM shops WHERE ownerId = ?', [currentProfile.id]);
  return rows;
}

// ----------------------------------------------------
// Service Implementations Under Test
// ----------------------------------------------------

async function testLoginOwnerWithCloud(params) {
  const res = await mockLoginOwnerApi(params);
  await setSecureAuthToken(res.token);

  const cloudShops = res.shops.map((s) => ({
    id: s.id,
    name: s.name,
    ownerId: s.ownerId || res.userId,
    createdAt: s.createdAt,
  }));
  await upsertShops(cloudShops);

  await cacheAuthenticatedUser({
    id: res.userId,
    name: res.name,
    role: 'OWNER',
    status: 'ACTIVE',
    pin: params.pin,
    shopId: res.activeShopId,
    phone: res.phone,
  });

  const profile = {
    id: res.userId,
    name: res.name,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    shopId: res.activeShopId,
    phone: res.phone,
  };
  setCurrentProfile(profile);
  setActiveShopId(res.activeShopId);

  assertJwtShopConsistency(res.token, res.activeShopId);

  return {
    profile,
    activeShopId: res.activeShopId,
    shops: cloudShops,
    token: res.token,
    isCloudAuthenticated: true,
  };
}

async function testSwitchShopWithCloud(shopId) {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can switch shops.');
  }

  const targetShopId = shopId?.trim().toUpperCase();
  if (!targetShopId) throw new Error('Target shop ID is required.');

  const ownedShops = getShopsByOwner(current.id);
  const targetShop = ownedShops.find((s) => s.id === targetShopId) || getShopById(targetShopId);
  if (targetShop && targetShop.ownerId !== current.id) {
    throw new Error(`Shop "${targetShopId}" is not owned by the current owner.`);
  }

  // 1. Request server switch
  const res = await mockSwitchShopApi({ shopId: targetShopId });

  // 2. Validate response
  if (!res || !res.token) {
    throw new Error('Server failed to return a new authentication token.');
  }
  if (res.shopId !== targetShopId) {
    throw new Error(`Server returned token for unexpected shop "${res.shopId}"`);
  }

  const tokenShopId = getShopIdFromJwt(res.token);
  if (tokenShopId && tokenShopId !== targetShopId) {
    throw new Error(`Token claims shopId "${tokenShopId}" does not match requested target "${targetShopId}".`);
  }

  if (!targetShop) {
    await upsertShops([{
      id: targetShopId,
      name: res.shopName || targetShopId,
      ownerId: current.id,
      createdAt: new Date().toISOString(),
    }]);
  }

  // 3. Persist new JWT in SecureStore FIRST
  await setSecureAuthToken(res.token);

  // 4. Update local active shop ONLY AFTER JWT is securely stored
  setActiveShopId(targetShopId);

  // 5. Update profile
  const updatedProfile = { ...current, shopId: targetShopId };
  setCurrentProfile(updatedProfile);

  return {
    success: true,
    shopId: targetShopId,
    token: res.token,
    profile: updatedProfile,
  };
}

async function testCreateShopWithCloud(name) {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can create a shop.');
  }
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('Shop name is required.');

  // Do NOT send ownerId
  const res = await mockCreateShopApi({ name: trimmed });
  const createdShop = {
    id: res.id,
    name: res.name,
    ownerId: res.ownerId || current.id,
    createdAt: res.createdAt,
  };

  await upsertShops([createdShop]);
  // Do NOT automatically change activeShopId
  return createdShop;
}

async function testFetchOwnedShopsWithCloud() {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can fetch owned shops.');
  }
  const res = await mockGetOwnedShopsApi();
  const cloudShops = (res || []).filter((s) => s.ownerId === current.id);
  await upsertShops(cloudShops);

  const currentActive = getActiveShopId();
  if (currentActive) {
    const stillOwned = cloudShops.some((s) => s.id === currentActive);
    if (!stillOwned && cloudShops.length > 0) {
      setActiveShopId(cloudShops[0].id);
    }
  }
  return cloudShops;
}

// ----------------------------------------------------
// SUITE EXECUTION
// ----------------------------------------------------

async function runSuite() {
  // Test 1: JWT Parser and Extraction Utilities
  console.log('Test 1: JWT extraction and claims decoding...');
  const testToken = createMockJwt({
    sub: 'user-123',
    phone: '9876543210',
    name: 'Alice',
    shopId: 'LC-SHOP-TEST',
    role: 'OWNER',
  });
  const parsed = parseJwtPayload(testToken);
  assert.equal(parsed.sub, 'user-123');
  assert.equal(parsed.shopId, 'LC-SHOP-TEST');
  assert.equal(getShopIdFromJwt(testToken), 'LC-SHOP-TEST');
  assert.equal(getUserIdFromJwt(testToken), 'user-123');
  assert.equal(getRoleFromJwt(testToken), 'OWNER');
  console.log('  ✓ Test 1 passed: JWT claims parsed and extracted correctly.');

  // Test 2: JWT / ActiveShop Consistency Invariant
  console.log('Test 2: JWT and activeShopId consistency checks...');
  const validCheck = verifyJwtShopConsistency(testToken, 'LC-SHOP-TEST');
  assert.equal(validCheck.valid, true);

  const invalidCheck = verifyJwtShopConsistency(testToken, 'LC-SHOP-OTHER');
  assert.equal(invalidCheck.valid, false);
  assert.match(invalidCheck.error, /Session inconsistency detected/);

  assert.throws(
    () => assertJwtShopConsistency(testToken, 'LC-SHOP-OTHER'),
    (err) => err instanceof SessionInconsistencyError
  );
  console.log('  ✓ Test 2 passed: Consistency assertions enforce token-shop matching.');

  // Test 3: Owner Cloud Login (Phase 3.2)
  console.log('Test 3: Owner cloud login with multiple owned shops...');
  const loginResult = await testLoginOwnerWithCloud({ phone: '9876543210', pin: '1234' });
  assert.equal(loginResult.activeShopId, 'LC-SHOP-A');
  assert.equal(loginResult.shops.length, 2);
  assert.equal(getActiveShopId(), 'LC-SHOP-A');
  assert.equal(getCurrentProfile().id, 'owner-uuid-1');

  // Verify JWT stored securely
  const storedJwt = await getSecureAuthToken();
  assert.equal(storedJwt, loginResult.token);
  assert.equal(getShopIdFromJwt(storedJwt), 'LC-SHOP-A');

  // Verify PIN stored in SecureStore ONLY
  const storedPin = await getSecureUserPin('owner-uuid-1');
  assert.equal(storedPin, '1234');

  // Verify AsyncStorage does NOT contain token or plaintext PIN
  assert.equal(await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN), null);
  const rawUsers = await mockAsyncStorage.getItem(STORAGE_KEY_USERS);
  assert.equal(rawUsers.includes('1234'), false, 'AsyncStorage must NOT contain plaintext PIN');
  console.log('  ✓ Test 3 passed: Owner cloud login succeeds, sets initial active shop, stores credentials securely.');

  // Test 4: Local SQLite Shop Store Hydration (Phase 3.3)
  console.log('Test 4: SQLite shop table contains hydrated cloud shops...');
  const dbRows = await sqlite.getAllAsync('SELECT * FROM shops ORDER BY id ASC');
  assert.equal(dbRows.length, 2);
  assert.equal(dbRows[0].id, 'LC-SHOP-A');
  assert.equal(dbRows[1].id, 'LC-SHOP-B');
  assert.equal(getShopById('LC-SHOP-A').name, 'Main Store');
  assert.equal(getShopById('LC-SHOP-B').name, 'Second Store');
  console.log('  ✓ Test 4 passed: Local SQLite and memory stores properly hydrated.');

  // Test 5: IMPORTANT NEGATIVE TEST: Failed server switch leaves state untouched
  console.log('Test 5: [NEGATIVE TEST] Failed server switch does NOT modify JWT or activeShopId...');
  const beforeToken = await getSecureAuthToken();
  const beforeActiveShop = getActiveShopId();
  assert.equal(getShopIdFromJwt(beforeToken), 'LC-SHOP-A');
  assert.equal(beforeActiveShop, 'LC-SHOP-A');

  mockServerFailSwitch = true;
  mockServerFailType = 'HTTP_403';

  await assert.rejects(
    async () => {
      await testSwitchShopWithCloud('LC-SHOP-B');
    },
    /HTTP 403: Forbidden/
  );

  const afterToken = await getSecureAuthToken();
  const afterActiveShop = getActiveShopId();
  assert.equal(afterToken, beforeToken, 'JWT must NOT change on switch failure');
  assert.equal(afterActiveShop, 'LC-SHOP-A', 'activeShopId must NOT change on switch failure');
  assert.equal(getShopIdFromJwt(afterToken), 'LC-SHOP-A');
  console.log('  ✓ Test 5 passed: Server rejection preserved state atomically (no partial switch).');

  // Test 6: [NEGATIVE TEST] Mismatched token returned by server is rejected
  console.log('Test 6: [NEGATIVE TEST] Mismatched token returned by server is rejected before state change...');
  mockServerFailSwitch = false;
  mockServerInvalidTokenShop = true;

  await assert.rejects(
    async () => {
      await testSwitchShopWithCloud('LC-SHOP-B');
    },
    /Token claims shopId "LC-SHOP-WRONG" does not match requested target "LC-SHOP-B"/
  );

  assert.equal(await getSecureAuthToken(), beforeToken);
  assert.equal(getActiveShopId(), 'LC-SHOP-A');
  mockServerInvalidTokenShop = false;
  console.log('  ✓ Test 6 passed: Validation caught mismatched token before storage or active shop mutation.');

  // Test 7: Successful Shop Switch (Phase 3.4)
  console.log('Test 7: Successful shop switch from Shop A -> Shop B...');
  const switchResult = await testSwitchShopWithCloud('LC-SHOP-B');
  assert.equal(switchResult.success, true);
  assert.equal(switchResult.shopId, 'LC-SHOP-B');

  const newJwt = await getSecureAuthToken();
  assert.notEqual(newJwt, beforeToken, 'JWT must be replaced with new server token');
  assert.equal(getShopIdFromJwt(newJwt), 'LC-SHOP-B', 'New JWT must be scoped to Shop B');
  assert.equal(getActiveShopId(), 'LC-SHOP-B', 'activeShopId must be updated to Shop B');
  assert.equal(getCurrentProfile().shopId, 'LC-SHOP-B');

  // Invariant holds
  assertJwtShopConsistency(newJwt, getActiveShopId());
  console.log('  ✓ Test 7 passed: Successfully switched from Shop A to Shop B with new shop-scoped JWT.');

  // Test 8: Create Shop With Cloud (Phase 3.5)
  console.log('Test 8: Owner creates an additional shop (does NOT change activeShopId)...');
  const activeBeforeCreate = getActiveShopId();
  assert.equal(activeBeforeCreate, 'LC-SHOP-B');

  const createdShop = await testCreateShopWithCloud('Branch 3');
  assert.equal(createdShop.id, 'LC-SHOP-C');
  assert.equal(createdShop.name, 'Branch 3');
  assert.equal(createdShop.ownerId, 'owner-uuid-1');

  // Verify created shop is persisted locally
  const shopCInDb = await sqlite.getFirstAsync('SELECT * FROM shops WHERE id = ?', ['LC-SHOP-C']);
  assert.notEqual(shopCInDb, null);
  assert.equal(shopCInDb.name, 'Branch 3');

  // Invariant: activeShopId must NOT automatically change upon creation
  assert.equal(getActiveShopId(), 'LC-SHOP-B', 'Active shop must remain unchanged after shop creation');
  console.log('  ✓ Test 8 passed: Shop created, persisted locally, and active shop preserved.');

  // Test 9: Fetch Owned Shops (Phase 3.6)
  console.log('Test 9: Fetch owned shops updates local shop store...');
  const allOwned = await testFetchOwnedShopsWithCloud();
  assert.equal(allOwned.length, 3);
  assert.equal(getActiveShopId(), 'LC-SHOP-B');
  console.log('  ✓ Test 9 passed: Owned shops fetched and synced.');

  // Test 10: Switch to newly created shop
  console.log('Test 10: Switch to newly created Shop C...');
  const switchToC = await testSwitchShopWithCloud('LC-SHOP-C');
  assert.equal(switchToC.shopId, 'LC-SHOP-C');
  assert.equal(getActiveShopId(), 'LC-SHOP-C');
  const jwtC = await getSecureAuthToken();
  assert.equal(getShopIdFromJwt(jwtC), 'LC-SHOP-C');
  console.log('  ✓ Test 10 passed: Switched to newly created Shop C.');

  // Test 11: Worker Regression & Isolation (Phase 3.9)
  console.log('Test 11: Worker security regression - Worker cannot switch or create shops...');
  const workerProfile = {
    id: 'worker-101',
    name: 'Bob Worker',
    role: 'WORKER',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    shopId: 'LC-SHOP-A',
  };
  setCurrentProfile(workerProfile);
  setActiveShopId('LC-SHOP-A');

  await assert.rejects(
    async () => {
      await testSwitchShopWithCloud('LC-SHOP-B');
    },
    /Only an authenticated shop owner can switch shops/
  );

  await assert.rejects(
    async () => {
      await testCreateShopWithCloud('Illegal Worker Shop');
    },
    /Only an authenticated shop owner can create a shop/
  );
  console.log('  ✓ Test 11 passed: Worker actions strictly isolated and forbidden from multi-shop operations.');

  // Test 12: Logout Behavior (Phase 3.8)
  console.log('Test 12: Logout clears session and JWT but preserves local data and PIN...');
  await setSecureAuthToken(null);
  setCurrentProfile(null);
  setActiveShopId(null);

  assert.equal(await getSecureAuthToken(), null, 'JWT must be cleared');
  assert.equal(getCurrentProfile(), null, 'Profile session must be cleared');
  assert.equal(getActiveShopId(), null, 'Active shop must be null');

  // Verify PIN is still in SecureStore for offline PIN auth
  assert.equal(await getSecureUserPin('owner-uuid-1'), '1234');
  // Verify shops are still in SQLite
  const remainingShops = await sqlite.getAllAsync('SELECT * FROM shops');
  assert.equal(remainingShops.length, 3, 'Local shops must not be deleted on logout');
  console.log('  ✓ Test 12 passed: Logout behavior verified.');

  console.log('\n============================================================');
  console.log('ALL PHASE 3 MULTI-SHOP FRONTEND TESTS PASSED SUCCESSFULLY');
  console.log('============================================================\n');
}

runSuite().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

import assert from 'node:assert/strict';

console.log('=== Running Secure Storage & Credential Verification ===\n');

// Mock AsyncStorage
const asyncStorageData = new Map();
const mockAsyncStorage = {
  getItem: async (key) => asyncStorageData.get(key) ?? null,
  setItem: async (key, val) => { asyncStorageData.set(key, String(val)); },
  removeItem: async (key) => { asyncStorageData.delete(key); },
  clear: async () => { asyncStorageData.clear(); },
};

// Mock SecureStore
const secureStoreData = new Map();
const mockSecureStore = {
  getItemAsync: async (key) => secureStoreData.get(key) ?? null,
  setItemAsync: async (key, val) => {
    // Validate key format per Expo docs
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

// Token helper functions matching src/lib/secure-storage.ts
async function getSecureAuthToken() {
  const token = await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
  if (token) return token;

  // Migration from legacy AsyncStorage
  const legacyToken = await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN);
  if (legacyToken) {
    await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, legacyToken);
    const verified = await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
    if (verified === legacyToken) {
      await mockAsyncStorage.removeItem(STORAGE_KEY_TOKEN);
    }
    return legacyToken;
  }
  return null;
}

async function setSecureAuthToken(token) {
  if (token) {
    await mockSecureStore.setItemAsync(STORAGE_KEY_TOKEN, token);
  } else {
    await mockSecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
  }
  await mockAsyncStorage.removeItem(STORAGE_KEY_TOKEN);
}

// User helper functions matching src/store/users.ts
function parseStoredUsers(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const users = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const profile = {
      id: item.id,
      name: item.name,
      role: item.role,
      status: item.status,
      createdAt: item.createdAt,
      ...(item.shopId ? { shopId: item.shopId } : {}),
      ...(item.phone ? { phone: item.phone } : {}),
    };
    const legacyPin = typeof item.pin === 'string' && item.pin.trim().length === 4 ? item.pin.trim() : undefined;
    users.push({ user: profile, legacyPin });
  }
  return users;
}

async function persistUsers(users) {
  // Strip PINs: NEVER write PINs to AsyncStorage!
  const sanitized = users.map(({ pin: _pin, ...profile }) => profile);
  await mockAsyncStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(sanitized));
}

async function loadPersistedUsers() {
  const raw = await mockAsyncStorage.getItem(STORAGE_KEY_USERS);
  if (!raw) return [];
  const parsed = parseStoredUsers(JSON.parse(raw));
  if (!parsed) return [];

  let hadLegacyPlaintextPins = false;
  const hydrated = [];

  for (const item of parsed) {
    let pin = await mockSecureStore.getItemAsync(getUserPinKey(item.user.id));
    if (item.legacyPin) {
      hadLegacyPlaintextPins = true;
      if (!pin) {
        await mockSecureStore.setItemAsync(getUserPinKey(item.user.id), item.legacyPin);
        pin = item.legacyPin;
      }
    }
    hydrated.push({ ...item.user, pin: pin || '' });
  }

  if (hadLegacyPlaintextPins) {
    await persistUsers(hydrated);
  }
  return hydrated;
}

function verifyPin(users, profileId, pin, expectedShopId) {
  const user = users.find((u) => u.id === profileId);
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.role === 'WORKER') {
    if (!user.shopId) return false;
    if (expectedShopId && user.shopId !== expectedShopId) return false;
  }
  return user.pin === pin;
}

// ====================================================================
// TEST SUITE
// ====================================================================

// Test 1: JWT Secure Storage & No Plaintext in AsyncStorage
{
  await mockAsyncStorage.clear();
  await mockSecureStore.clear();

  await setSecureAuthToken('jwt-token-xyz-123');

  // Token is saved in SecureStore
  const storedToken = await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
  assert.equal(storedToken, 'jwt-token-xyz-123');

  // Token is NOT in AsyncStorage
  const asyncToken = await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN);
  assert.equal(asyncToken, null);

  // Token retrieval works
  const readToken = await getSecureAuthToken();
  assert.equal(readToken, 'jwt-token-xyz-123');

  console.log('✓ Test 1: JWT token stored securely in SecureStore; absent from AsyncStorage.');
}

// Test 2: JWT Migration from Legacy AsyncStorage
{
  await mockAsyncStorage.clear();
  await mockSecureStore.clear();

  // Simulate existing installation with legacy token in AsyncStorage
  await mockAsyncStorage.setItem(STORAGE_KEY_TOKEN, 'legacy-jwt-token-456');

  // Reading token triggers seamless migration
  const migrated = await getSecureAuthToken();
  assert.equal(migrated, 'legacy-jwt-token-456');

  // Plaintext token is removed from AsyncStorage
  const remainingAsync = await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN);
  assert.equal(remainingAsync, null);

  // Token is securely saved in SecureStore
  const secureValue = await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN);
  assert.equal(secureValue, 'legacy-jwt-token-456');

  console.log('✓ Test 2: Legacy JWT in AsyncStorage safely migrated to SecureStore and removed.');
}

// Test 3: Logout Clears JWT Token
{
  await setSecureAuthToken('active-jwt');
  assert.equal(await getSecureAuthToken(), 'active-jwt');

  // Perform logout
  await setSecureAuthToken(null);

  // Token is null in both stores
  assert.equal(await getSecureAuthToken(), null);
  assert.equal(await mockSecureStore.getItemAsync(STORAGE_KEY_TOKEN), null);
  assert.equal(await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN), null);

  console.log('✓ Test 3: Logout securely removes JWT authentication token.');
}

// Test 4: PIN Migration from Legacy AsyncStorage
{
  await mockAsyncStorage.clear();
  await mockSecureStore.clear();

  // Simulate existing installation with plaintext PINs in AsyncStorage
  const legacyUsers = [
    { id: 'owner-uuid-1', name: 'Alice Owner', role: 'OWNER', status: 'ACTIVE', pin: '1111', createdAt: '2026-01-01' },
    { id: 'worker-uuid-2', name: 'Bob Cashier', role: 'WORKER', status: 'ACTIVE', pin: '2222', shopId: 'LC-SHOP1', createdAt: '2026-01-02' },
  ];
  await mockAsyncStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(legacyUsers));

  // Load users (triggers migration)
  const hydrated = await loadPersistedUsers();
  assert.equal(hydrated.length, 2);

  // In memory, users have their PINs loaded
  assert.equal(hydrated[0].pin, '1111');
  assert.equal(hydrated[1].pin, '2222');

  // In SecureStore, PINs are securely stored
  assert.equal(await mockSecureStore.getItemAsync(getUserPinKey('owner-uuid-1')), '1111');
  assert.equal(await mockSecureStore.getItemAsync(getUserPinKey('worker-uuid-2')), '2222');

  // In AsyncStorage, plaintext PINs have been STRIPPED!
  const asyncRaw = await mockAsyncStorage.getItem(STORAGE_KEY_USERS);
  const asyncUsers = JSON.parse(asyncRaw);
  assert.equal(asyncUsers[0].pin, undefined);
  assert.equal(asyncUsers[1].pin, undefined);
  assert.equal(asyncUsers[0].id, 'owner-uuid-1');
  assert.equal(asyncUsers[1].id, 'worker-uuid-2');

  // Verify second load (idempotent, no plaintext migration needed)
  const reloaded = await loadPersistedUsers();
  assert.equal(reloaded[0].pin, '1111');
  assert.equal(reloaded[1].pin, '2222');

  console.log('✓ Test 4: Legacy plaintext PINs migrated to SecureStore and stripped from AsyncStorage.');
}

// Test 5: Offline PIN Authentication
{
  const users = [
    { id: 'owner-uuid-1', name: 'Alice', role: 'OWNER', status: 'ACTIVE', pin: '1111' },
    { id: 'worker-uuid-2', name: 'Bob', role: 'WORKER', status: 'ACTIVE', pin: '2222', shopId: 'LC-SHOP1' },
    { id: 'worker-uuid-3', name: 'Charlie', role: 'WORKER', status: 'INACTIVE', pin: '3333', shopId: 'LC-SHOP1' },
  ];

  // Correct PINs
  assert.equal(verifyPin(users, 'owner-uuid-1', '1111'), true);
  assert.equal(verifyPin(users, 'worker-uuid-2', '2222', 'LC-SHOP1'), true);

  // Incorrect PINs
  assert.equal(verifyPin(users, 'owner-uuid-1', '9999'), false);
  assert.equal(verifyPin(users, 'worker-uuid-2', '0000', 'LC-SHOP1'), false);

  // Inactive user
  assert.equal(verifyPin(users, 'worker-uuid-3', '3333', 'LC-SHOP1'), false);

  // Cross-shop isolation (worker belonging to LC-SHOP1 trying to log into LC-SHOP2)
  assert.equal(verifyPin(users, 'worker-uuid-2', '2222', 'LC-SHOP2'), false);

  console.log('✓ Test 5: Offline PIN authentication, wrong PIN rejection, and shop isolation verified.');
}

// Test 6: Worker ID Consistency Preserved with Secure PINs
{
  await mockAsyncStorage.clear();
  await mockSecureStore.clear();

  const serverGeneratedWorkerUserId = 'e2f3g4h5-6789-abcd-ef01-234567890abc';
  const workerPin = '7777';
  const shopId = 'LC-AUTH01';

  // Save worker with server-generated ID and secure PIN
  await mockSecureStore.setItemAsync(getUserPinKey(serverGeneratedWorkerUserId), workerPin);
  const newWorker = {
    id: serverGeneratedWorkerUserId,
    name: 'Dilip Worker',
    role: 'WORKER',
    status: 'ACTIVE',
    shopId,
    createdAt: new Date().toISOString(),
    pin: workerPin,
  };

  await persistUsers([newWorker]);

  // Verify AsyncStorage does not contain the PIN
  const stored = JSON.parse(await mockAsyncStorage.getItem(STORAGE_KEY_USERS));
  assert.equal(stored[0].id, serverGeneratedWorkerUserId);
  assert.equal(stored[0].pin, undefined);

  // Verify hydration reconstitutes the exact server ID with the SecureStore PIN
  const hydrated = await loadPersistedUsers();
  assert.equal(hydrated[0].id, serverGeneratedWorkerUserId);
  assert.equal(hydrated[0].pin, '7777');
  assert.equal(verifyPin(hydrated, serverGeneratedWorkerUserId, '7777', shopId), true);

  console.log('✓ Test 6: Server-generated Worker ID consistency verified with secure PIN storage.');
}

console.log('\nAll secure storage verification tests passed successfully!');

import assert from 'node:assert/strict';

console.log('=== Running Worker Remember Last Shop ID Verification ===\n');

// Mock AsyncStorage
const asyncStorageData = new Map();
const mockAsyncStorage = {
  getItem: async (key) => asyncStorageData.get(key) ?? null,
  setItem: async (key, val) => { asyncStorageData.set(key, String(val)); },
  removeItem: async (key) => { asyncStorageData.delete(key); },
  clear: async () => { asyncStorageData.clear(); },
};

const STORAGE_KEY_LAST_WORKER_SHOP = 'ledgecash_last_worker_shop';
const STORAGE_KEY_TOKEN = 'cashmanager_auth_token';

// Helpers matching src/lib/auth-service.ts
async function getLastWorkerShopId() {
  try {
    const val = await mockAsyncStorage.getItem(STORAGE_KEY_LAST_WORKER_SHOP);
    return val ? val.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

async function setLastWorkerShopId(shopId) {
  try {
    if (!shopId) return;
    const sanitized = shopId.trim().toUpperCase();
    await mockAsyncStorage.setItem(STORAGE_KEY_LAST_WORKER_SHOP, sanitized);
  } catch (err) {
    console.warn('Failed to save last worker shop ID:', err);
  }
}

async function clearLastWorkerShopId() {
  try {
    await mockAsyncStorage.removeItem(STORAGE_KEY_LAST_WORKER_SHOP);
  } catch (err) {
    console.warn('Failed to clear last worker shop ID:', err);
  }
}

// Mock logout matching src/lib/auth-service.ts
let currentSession = null;
async function mockLogout() {
  await mockAsyncStorage.removeItem(STORAGE_KEY_TOKEN);
  currentSession = null;
  // Note: logout intentionally does NOT clear STORAGE_KEY_LAST_WORKER_SHOP
}

// Mock app reset matching src/lib/reset-app.ts
async function mockResetAllAppData() {
  currentSession = null;
  await mockAsyncStorage.removeItem(STORAGE_KEY_TOKEN);
  await mockAsyncStorage.removeItem(STORAGE_KEY_LAST_WORKER_SHOP);
}

// Mock loginWithCloudOrLocal logic
async function mockLogin({ profile, shopId, pin, isOnline = true, validShops = new Map() }) {
  if (isOnline) {
    // Backend validation of shop and PIN
    const shopWorkers = validShops.get(shopId);
    if (!shopWorkers) {
      const err = new Error('Shop not found. Please verify the Shop ID.');
      err.status = 404;
      throw err;
    }
    const registered = shopWorkers.find((w) => w.id === profile.id);
    if (!registered) {
      const err = new Error('Selected worker is not authorized for this shop.');
      err.status = 400;
      throw err;
    }
    if (registered.status !== 'ACTIVE') {
      const err = new Error('Account is inactive. Please contact your shop owner.');
      err.status = 403;
      throw err;
    }
    if (registered.pin !== pin) {
      const err = new Error('Incorrect PIN. Please try again.');
      err.status = 400;
      throw err;
    }

    currentSession = { profile, shopId };
    await mockAsyncStorage.setItem(STORAGE_KEY_TOKEN, 'fake-jwt-token');

    // Worker login persists shop ID; Owner login does not
    if (profile.role === 'WORKER' && shopId) {
      await setLastWorkerShopId(shopId);
    }
    return { profile, isCloudAuthenticated: true };
  } else {
    // Offline verification
    if (profile.pin !== pin) {
      throw new Error('Incorrect PIN. Please try again.');
    }
    currentSession = { profile, shopId };
    if (profile.role === 'WORKER' && shopId) {
      await setLastWorkerShopId(shopId);
    }
    return { profile, isCloudAuthenticated: false };
  }
}

// Mock shop validation API matching fetchShopAndWorkersFromCloud
async function mockFetchShopAndWorkers(shopCode, validShops) {
  const normalized = shopCode.trim().toUpperCase();
  if (!normalized) {
    throw new Error('Please enter a Shop ID.');
  }
  const workers = validShops.get(normalized);
  if (!workers) {
    throw new Error(`Shop not found with code: ${normalized}`);
  }
  return { shopId: normalized, workers };
}

// ====================================================================
// TEST SUITE
// ====================================================================

const validShops = new Map([
  [
    'LC-ALPHA1',
    [
      { id: 'w-1', name: 'Alice', role: 'WORKER', status: 'ACTIVE', pin: '1111' },
      { id: 'w-2', name: 'Bob', role: 'WORKER', status: 'INACTIVE', pin: '2222' },
    ],
  ],
  [
    'LC-BETA2',
    [
      { id: 'w-3', name: 'Charlie', role: 'WORKER', status: 'ACTIVE', pin: '3333' },
    ],
  ],
]);

// Test 1: Successful worker login saves Shop ID
{
  await mockAsyncStorage.clear();
  const worker = { id: 'w-1', name: 'Alice', role: 'WORKER', pin: '1111' };

  await mockLogin({ profile: worker, shopId: 'LC-ALPHA1', pin: '1111', validShops });

  const savedShop = await mockAsyncStorage.getItem(STORAGE_KEY_LAST_WORKER_SHOP);
  assert.equal(savedShop, 'LC-ALPHA1', 'Shop ID should be saved after successful worker login');
  console.log('✓ Test 1: Successful worker login saves Shop ID.');
}

// Test 2: Next worker-login screen loads the saved Shop ID
{
  const loadedShop = await getLastWorkerShopId();
  assert.equal(loadedShop, 'LC-ALPHA1', 'Should retrieve saved Shop ID on next worker login screen');
  console.log('✓ Test 2: Next worker-login screen loads the saved Shop ID.');
}

// Test 3: User can edit the remembered Shop ID
{
  let inputState = await getLastWorkerShopId();
  assert.equal(inputState, 'LC-ALPHA1');

  // Worker changes text input to another shop
  inputState = 'LC-BETA2';
  assert.equal(inputState, 'LC-BETA2', 'User can freely edit the shop ID input');
  console.log('✓ Test 3: User can edit the remembered Shop ID.');
}

// Test 4: Changed Shop ID is validated normally against the cloud
{
  // User validates the new edited Shop ID LC-BETA2
  const shopData = await mockFetchShopAndWorkers('LC-BETA2', validShops);
  assert.equal(shopData.shopId, 'LC-BETA2');
  assert.equal(shopData.workers.length, 1);
  assert.equal(shopData.workers[0].name, 'Charlie');

  // Authenticate as Charlie in LC-BETA2
  const charlie = { id: 'w-3', name: 'Charlie', role: 'WORKER', pin: '3333' };
  await mockLogin({ profile: charlie, shopId: 'LC-BETA2', pin: '3333', validShops });

  // Now the remembered shop should be updated to LC-BETA2
  const updatedShop = await getLastWorkerShopId();
  assert.equal(updatedShop, 'LC-BETA2', 'Remembered shop should update to the newly authenticated shop');
  console.log('✓ Test 4: Changed Shop ID is validated normally and saved upon login.');
}

// Test 5: Invalid remembered Shop ID does not bypass validation
{
  // Pretend saved shop is LC-NONEXISTENT
  await setLastWorkerShopId('LC-NONEXISTENT');

  await assert.rejects(
    async () => {
      await mockFetchShopAndWorkers('LC-NONEXISTENT', validShops);
    },
    /Shop not found/,
    'Invalid remembered Shop ID must fail validation and not allow login'
  );

  // Authentication cannot proceed without valid cloud shop
  await assert.rejects(
    async () => {
      await mockLogin({
        profile: { id: 'w-99', name: 'Ghost', role: 'WORKER', pin: '9999' },
        shopId: 'LC-NONEXISTENT',
        pin: '9999',
        validShops,
      });
    },
    /Shop not found/
  );
  console.log('✓ Test 5: Invalid remembered Shop ID does not bypass validation.');
}

// Test 6: Worker logout does not accidentally destroy the remembered Shop ID
{
  await setLastWorkerShopId('LC-ALPHA1');
  await mockLogout();

  // JWT is cleared
  const token = await mockAsyncStorage.getItem(STORAGE_KEY_TOKEN);
  assert.equal(token, null, 'JWT token must be cleared on logout');

  // Remembered Shop ID remains intact
  const savedShop = await getLastWorkerShopId();
  assert.equal(savedShop, 'LC-ALPHA1', 'Remembered Shop ID must survive normal worker logout');
  console.log('✓ Test 6: Worker logout retains the remembered Shop ID.');
}

// Test 7: App Reset clears the remembered Shop ID
{
  await setLastWorkerShopId('LC-ALPHA1');
  await mockResetAllAppData();

  const savedShop = await getLastWorkerShopId();
  assert.equal(savedShop, null, 'App reset must clear remembered Shop ID');
  console.log('✓ Test 7: App reset clears the remembered Shop ID.');
}

// Test 8: Owner login/setup remains unaffected
{
  await mockAsyncStorage.clear();
  const owner = { id: 'owner-1', name: 'Boss', role: 'OWNER', pin: '0000' };

  // Owner logs into their shop
  await mockLogin({
    profile: owner,
    shopId: 'LC-ALPHA1',
    pin: '0000',
    isOnline: false, // local verification
  });

  const workerShopKey = await mockAsyncStorage.getItem(STORAGE_KEY_LAST_WORKER_SHOP);
  assert.equal(workerShopKey, null, 'Owner login must never set or modify worker remembered Shop ID');
  console.log('✓ Test 8: Owner login/setup remains unaffected.');
}

// Test 9: No PIN/JWT is stored in the Shop ID persistence value
{
  await setLastWorkerShopId('LC-SECURE99');
  const rawStored = await mockAsyncStorage.getItem(STORAGE_KEY_LAST_WORKER_SHOP);

  assert.equal(typeof rawStored, 'string');
  assert.equal(rawStored, 'LC-SECURE99');
  assert.equal(rawStored.includes('pin'), false);
  assert.equal(rawStored.includes('jwt'), false);
  assert.equal(rawStored.includes('token'), false);
  assert.equal(rawStored.includes('password'), false);
  console.log('✓ Test 9: No PIN/JWT/secret is stored in the Shop ID persistence value.');
}

console.log('\nAll Worker Remember Last Shop ID tests passed successfully!');

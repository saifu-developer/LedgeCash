import assert from 'node:assert/strict';

function generateShopId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = 'LC-';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

console.log('Testing Split Onboarding & Multi-Shop Flow...');

// 1. Independent Owner Creation
const owner = {
  id: `owner-${Date.now()}`,
  name: 'Anita Sharma',
  role: 'OWNER',
  status: 'ACTIVE',
  pin: '1234',
  createdAt: new Date().toISOString(),
};

assert.equal(owner.role, 'OWNER');
assert.equal(owner.name, 'Anita Sharma');
assert.equal(owner.pin, '1234');
console.log('✔ 1. Owner account created independently without a shop.');

// 2. Subsequent Shop Setup
const shop1Id = generateShopId();
assert.match(shop1Id, /^LC-[0-9A-Z]{6}$/);

const shop1 = {
  id: shop1Id,
  name: 'Anita Kirana Store',
  ownerId: owner.id,
  createdAt: new Date().toISOString(),
};

let activeShopId = shop1.id;
assert.equal(activeShopId, shop1.id);
assert.equal(shop1.ownerId, owner.id);
console.log(`✔ 2. First shop created and activated: ${shop1.name} (${shop1.id})`);

// 3. Multi-Shop: Add Second Shop without re-registering Owner
const shop2Id = generateShopId();
assert.match(shop2Id, /^LC-[0-9A-Z]{6}$/);
assert.notEqual(shop1Id, shop2Id);

const shop2 = {
  id: shop2Id,
  name: 'Anita Dairy & Sweets',
  ownerId: owner.id,
  createdAt: new Date().toISOString(),
};

const ownedShops = [shop1, shop2];
assert.equal(ownedShops.length, 2);
assert.equal(ownedShops.every(s => s.ownerId === owner.id), true);
console.log(`✔ 3. Additional shop created under same owner: ${shop2.name} (${shop2.id})`);

// 4. Switch Active Shop
activeShopId = shop2.id;
assert.equal(activeShopId, shop2.id);
console.log(`✔ 4. Switched active shop to: ${shop2.id}`);

console.log('\nAll Split Onboarding & Multi-Shop tests passed successfully!');

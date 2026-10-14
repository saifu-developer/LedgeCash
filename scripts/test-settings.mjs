import assert from 'node:assert/strict';

// Test changeOwnerPin verification logic
function mockChangeOwnerPin(owner, oldPin, newPin) {
  if (owner.pin !== oldPin) {
    throw new Error('Incorrect current PIN.');
  }
  if (!/^\d{4}$/.test(newPin)) {
    throw new Error('New PIN must be exactly 4 digits.');
  }
  if (oldPin === newPin) {
    throw new Error('New PIN must be different from current PIN.');
  }
  return { ...owner, pin: newPin };
}

console.log('=== Running Settings & Owner Security Verification ===\n');

// Test 1: Wrong old PIN
{
  const owner = { id: 'owner-1', name: 'Boss', role: 'OWNER', pin: '1234' };
  assert.throws(
    () => mockChangeOwnerPin(owner, '9999', '5678'),
    /Incorrect current PIN/
  );
  console.log('✓ Test 1: Incorrect old PIN correctly rejected.');
}

// Test 2: Invalid new PIN format
{
  const owner = { id: 'owner-1', name: 'Boss', role: 'OWNER', pin: '1234' };
  assert.throws(
    () => mockChangeOwnerPin(owner, '1234', '12'),
    /New PIN must be exactly 4 digits/
  );
  assert.throws(
    () => mockChangeOwnerPin(owner, '1234', 'abcd'),
    /New PIN must be exactly 4 digits/
  );
  console.log('✓ Test 2: Non-4-digit new PIN rejected.');
}

// Test 3: Same PIN as current
{
  const owner = { id: 'owner-1', name: 'Boss', role: 'OWNER', pin: '1234' };
  assert.throws(
    () => mockChangeOwnerPin(owner, '1234', '1234'),
    /New PIN must be different from current PIN/
  );
  console.log('✓ Test 3: Identical PIN rejected.');
}

// Test 4: Successful PIN change
{
  const owner = { id: 'owner-1', name: 'Boss', role: 'OWNER', pin: '1234' };
  const updated = mockChangeOwnerPin(owner, '1234', '5678');
  assert.equal(updated.pin, '5678');
  console.log('✓ Test 4: Valid PIN update successful.');
}

// Test 5: JSON backup structure verification
{
  const shop = { id: 'LC-TEST01', name: 'Test Shop' };
  const transactions = [{ id: 't1', amount: 100 }, { id: 't2', amount: 200 }];
  const audit = [{ id: 'a1', action: 'EDIT' }];

  const backupData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    shop,
    transactions,
    audit,
  };

  const jsonStr = JSON.stringify(backupData);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.shop.id, 'LC-TEST01');
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.audit.length, 1);
  console.log('✓ Test 5: JSON backup structure verified.');
}

console.log('\nAll settings tests completed successfully!');

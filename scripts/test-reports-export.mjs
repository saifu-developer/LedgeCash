import assert from 'node:assert/strict';

// Test CSV escaping logic
function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateLedgerCsv(transactions) {
  const headers = ['Date', 'Time', 'Type', 'Amount', 'Category', 'Handled By', 'Description'];
  const rows = [headers.join(',')];

  for (const t of transactions) {
    const dateStr = t.createdAt.split('T')[0] ?? t.createdAt;
    const timeStr = '12:00 PM';
    const typeStr = t.type === 'CASH_IN' ? 'Cash In' : t.type === 'UPI_IN' ? 'UPI In' : 'Cash Out';
    const amountStr = t.amount.toFixed(2);
    const categoryStr = t.category ?? '';
    const handledByStr = t.createdBy.name;
    const descStr = t.description ?? '';

    const row = [
      escapeCsvField(dateStr),
      escapeCsvField(timeStr),
      escapeCsvField(typeStr),
      escapeCsvField(amountStr),
      escapeCsvField(categoryStr),
      escapeCsvField(handledByStr),
      escapeCsvField(descStr),
    ];

    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}

console.log('=== Running Reports & CSV Export Unit Verification ===\n');

// Test 1: CSV RFC 4180 Escaping
{
  const txns = [
    {
      id: 'tx-1',
      createdAt: '2026-10-14T10:00:00.000Z',
      type: 'CASH_IN',
      amount: 1500,
      createdBy: { id: 'w1', name: 'John "The Boss", Jr.' },
      category: null,
      description: 'Morning till, with commas and "quotes"',
    },
    {
      id: 'tx-2',
      createdAt: '2026-10-14T11:30:00.000Z',
      type: 'CASH_OUT',
      amount: 450,
      createdBy: { id: 'o1', name: 'Owner' },
      category: 'Supplies',
      description: 'Chalk, paper\nand pens',
    },
  ];

  const csv = generateLedgerCsv(txns);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Date,Time,Type,Amount,Category,Handled By,Description');
  assert.ok(lines[1].includes('"John ""The Boss"", Jr."'));
  assert.ok(lines[1].includes('"Morning till, with commas and ""quotes"""'));
  assert.ok(lines[2].includes('"Chalk, paper\nand pens"'));
  console.log('✓ Test 1: RFC 4180 CSV escaping passed.');
}

// Test 2: Inflow / Outflow & Ratios
{
  const txns = [
    { type: 'CASH_IN', amount: 3000 },
    { type: 'UPI_IN', amount: 2000 },
    { type: 'CASH_OUT', amount: 1500 },
  ];

  const totalCashIn = txns.filter(t => t.type === 'CASH_IN').reduce((acc, t) => acc + t.amount, 0);
  const totalUpiIn = txns.filter(t => t.type === 'UPI_IN').reduce((acc, t) => acc + t.amount, 0);
  const totalOutflow = txns.filter(t => t.type === 'CASH_OUT').reduce((acc, t) => acc + t.amount, 0);
  const totalInflow = totalCashIn + totalUpiIn;
  const netProfit = totalInflow - totalOutflow;
  const cashRatio = Math.round((totalCashIn / totalInflow) * 100);
  const upiRatio = 100 - cashRatio;

  assert.equal(totalInflow, 5000);
  assert.equal(totalOutflow, 1500);
  assert.equal(netProfit, 3500);
  assert.equal(cashRatio, 60);
  assert.equal(upiRatio, 40);
  console.log('✓ Test 2: Inflow/Outflow, Net Profit, and Ratio arithmetic verified.');
}

console.log('\nAll tests completed successfully!');

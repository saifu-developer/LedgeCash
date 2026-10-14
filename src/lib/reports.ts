import { EXPENSE_CATEGORIES, type ExpenseCategory, type Transaction } from '@/types/transaction';

export type ReportPeriod = 'today' | 'week' | 'month' | 'last_month' | 'custom';

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  last_month: 'Last Month',
  custom: 'Custom Range',
};

export type DateRange = {
  start: Date;
  end: Date;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function getReportDateRange(
  period: ReportPeriod,
  customRange?: { start: Date; end: Date },
  referenceDate = new Date()
): DateRange {
  const now = referenceDate;

  if (period === 'today') {
    return {
      start: startOfDay(now),
      end: endOfDay(now),
    };
  }

  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      start: startOfDay(monday),
      end: endOfDay(sunday),
    };
  }

  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      start: startOfDay(firstDay),
      end: endOfDay(lastDay),
    };
  }

  if (period === 'last_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

    return {
      start: startOfDay(firstDay),
      end: endOfDay(lastDay),
    };
  }

  // Custom period
  if (customRange) {
    const s = customRange.start < customRange.end ? customRange.start : customRange.end;
    const e = customRange.start < customRange.end ? customRange.end : customRange.start;
    return {
      start: startOfDay(s),
      end: endOfDay(e),
    };
  }

  // Default custom range: last 7 days
  const defaultStart = new Date(now);
  defaultStart.setDate(now.getDate() - 6);
  return {
    start: startOfDay(defaultStart),
    end: endOfDay(now),
  };
}

export type CategoryExpense = {
  category: ExpenseCategory;
  amount: number;
  percentage: number;
  count: number;
};

export type WorkerCollection = {
  workerId: string;
  workerName: string;
  cashIn: number;
  upiIn: number;
  totalCollected: number;
  transactionCount: number;
  percentageOfTotal: number;
};

export type FinancialReportData = {
  period: ReportPeriod;
  dateRange: DateRange;
  totalCashIn: number;
  totalUpiIn: number;
  totalInflow: number;
  totalOutflow: number;
  netProfit: number;
  cashRatio: number; // 0 to 100
  upiRatio: number; // 0 to 100
  transactionCount: number;
  categoryExpenses: CategoryExpense[];
  workerCollections: WorkerCollection[];
  filteredTransactions: Transaction[];
};

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  range: DateRange
): Transaction[] {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  return transactions.filter((t) => {
    const tMs = new Date(t.createdAt).getTime();
    return tMs >= startMs && tMs <= endMs;
  });
}

export function generateFinancialReport(
  transactions: Transaction[],
  period: ReportPeriod,
  customRange?: { start: Date; end: Date },
  referenceDate = new Date()
): FinancialReportData {
  const dateRange = getReportDateRange(period, customRange, referenceDate);
  const filtered = filterTransactionsByDateRange(transactions, dateRange);

  let totalCashIn = 0;
  let totalUpiIn = 0;
  let totalOutflow = 0;

  const categoryMap = new Map<ExpenseCategory, { amount: number; count: number }>();
  for (const cat of EXPENSE_CATEGORIES) {
    categoryMap.set(cat, { amount: 0, count: 0 });
  }

  const workerMap = new Map<
    string,
    { name: string; cashIn: number; upiIn: number; count: number }
  >();

  for (const t of filtered) {
    if (t.type === 'CASH_IN') {
      totalCashIn += t.amount;
      const worker = workerMap.get(t.createdBy.id) ?? {
        name: t.createdBy.name,
        cashIn: 0,
        upiIn: 0,
        count: 0,
      };
      worker.cashIn += t.amount;
      worker.count += 1;
      workerMap.set(t.createdBy.id, worker);
    } else if (t.type === 'UPI_IN') {
      totalUpiIn += t.amount;
      const worker = workerMap.get(t.createdBy.id) ?? {
        name: t.createdBy.name,
        cashIn: 0,
        upiIn: 0,
        count: 0,
      };
      worker.upiIn += t.amount;
      worker.count += 1;
      workerMap.set(t.createdBy.id, worker);
    } else if (t.type === 'CASH_OUT') {
      totalOutflow += t.amount;
      const cat = (t.category as ExpenseCategory) || 'Other';
      const existing = categoryMap.get(cat) ?? { amount: 0, count: 0 };
      existing.amount += t.amount;
      existing.count += 1;
      categoryMap.set(cat, existing);
    }
  }

  const totalInflow = totalCashIn + totalUpiIn;
  const netProfit = totalInflow - totalOutflow;
  const cashRatio = totalInflow > 0 ? Math.round((totalCashIn / totalInflow) * 100) : 0;
  const upiRatio = totalInflow > 0 ? 100 - cashRatio : 0;

  // Category breakdown
  const categoryExpenses: CategoryExpense[] = [];
  categoryMap.forEach((val, cat) => {
    if (val.amount > 0) {
      categoryExpenses.push({
        category: cat,
        amount: val.amount,
        count: val.count,
        percentage: totalOutflow > 0 ? (val.amount / totalOutflow) * 100 : 0,
      });
    }
  });
  categoryExpenses.sort((a, b) => b.amount - a.amount);

  // Worker collections breakdown
  const workerCollections: WorkerCollection[] = [];
  workerMap.forEach((val, workerId) => {
    const totalCollected = val.cashIn + val.upiIn;
    workerCollections.push({
      workerId,
      workerName: val.name,
      cashIn: val.cashIn,
      upiIn: val.upiIn,
      totalCollected,
      transactionCount: val.count,
      percentageOfTotal: totalInflow > 0 ? (totalCollected / totalInflow) * 100 : 0,
    });
  });
  workerCollections.sort((a, b) => b.totalCollected - a.totalCollected);

  return {
    period,
    dateRange,
    totalCashIn,
    totalUpiIn,
    totalInflow,
    totalOutflow,
    netProfit,
    cashRatio,
    upiRatio,
    transactionCount: filtered.length,
    categoryExpenses,
    workerCollections,
    filteredTransactions: filtered,
  };
}

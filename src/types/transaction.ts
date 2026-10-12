export type TransactionType = 'CASH_IN' | 'UPI_IN' | 'CASH_OUT';

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Supplies',
  'Salary',
  'Shop Requirement',
  'Transport',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  category?: ExpenseCategory;
  description?: string;
};

export type DailyOverview = {
  cashIn: number;
  upiIn: number;
  cashOut: number;
  totalIn: number;
  balance: number;
};

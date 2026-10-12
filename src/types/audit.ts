import type { ExpenseCategory, TransactionType } from '@/types/transaction';

export type AuditAction = 'EDIT' | 'DELETE';

export type AuditActor = {
  id: string;
  name: string;
};

export type AuditEntry = {
  id: string;
  action: AuditAction;
  transactionId: string;
  originalAmount: number;
  newAmount: number | null;
  originalType: TransactionType;
  createdBy: AuditActor;
  correctedBy: AuditActor;
  createdAt: string;
  category?: ExpenseCategory;
  description?: string;
};

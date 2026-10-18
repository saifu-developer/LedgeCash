import type { TransactionType } from '@/types/transaction';

export type SyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  error: string | null;
};

export type ServerTransaction = {
  id: string;
  shopId: string;
  type: TransactionType;
  amount: number;
  category?: string;
  description?: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
  isDeleted?: boolean;
};

export type SyncBatchResponse = {
  syncedCount: number;
  serverChanges: ServerTransaction[];
  syncTimestamp: string;
};

export const OWNER_ACTIONS = {
  'cash-in': 'Cash In',
  'upi-in': 'UPI In',
  'cash-out': 'Cash Out',
  transactions: 'Transactions',
  reports: 'Reports',
  workers: 'Workers',
  'correction-history': 'Correction History',
  settings: 'Settings',
} as const;

export type OwnerAction = keyof typeof OWNER_ACTIONS;

export const WORKER_ACTIONS = {
  'cash-in': 'Cash In',
  'upi-in': 'UPI In',
  transactions: 'Transactions',
} as const;

export type WorkerAction = keyof typeof WORKER_ACTIONS;

export function isOwnerAction(value: string): value is OwnerAction {
  return value in OWNER_ACTIONS;
}

export function isWorkerAction(value: string): value is WorkerAction {
  return value in WORKER_ACTIONS;
}

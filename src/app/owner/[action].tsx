import { useLocalSearchParams } from 'expo-router';

import { ComingSoonScreen } from '@/components/dashboard/coming-soon-screen';
import { CashOutScreen } from '@/components/payments/cash-out-screen';
import { PaymentEntryScreen } from '@/components/payments/payment-entry-screen';
import { CorrectionHistoryScreen } from '@/components/transactions/correction-history-screen';
import { TransactionHistoryScreen } from '@/components/transactions/transaction-history-screen';
import { AddWorkerScreen } from '@/components/workers/add-worker-screen';
import { WorkerListScreen } from '@/components/workers/worker-list-screen';
import { isOwnerAction, OWNER_ACTIONS } from '@/lib/placeholder-actions';
import { useCurrentProfile } from '@/session/current-profile';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function OwnerActionScreen() {
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const action = firstParam(params.action);
  const profile = useCurrentProfile();

  if (action === 'cash-in') {
    return <PaymentEntryScreen type="CASH_IN" title="Cash In" />;
  }

  if (action === 'upi-in') {
    return <PaymentEntryScreen type="UPI_IN" title="UPI In" />;
  }

  if (action === 'cash-out') {
    return <CashOutScreen />;
  }

  if (action === 'transactions') {
    if (!profile || profile.role !== 'OWNER') {
      return (
        <ComingSoonScreen
          title="Transactions"
          description="Only the owner can view the full transaction history."
          backHref="/owner"
        />
      );
    }

    return <TransactionHistoryScreen role="OWNER" profileId={profile.id} />;
  }

  if (action === 'correction-history') {
    if (!profile || profile.role !== 'OWNER') {
      return (
        <ComingSoonScreen
          title="Correction History"
          description="Only the owner can view correction history."
          backHref="/owner"
        />
      );
    }

    return <CorrectionHistoryScreen />;
  }

  if (action === 'workers') {
    return <WorkerListScreen />;
  }

  if (action === 'add-worker') {
    return <AddWorkerScreen />;
  }

  const title = action && isOwnerAction(action) ? OWNER_ACTIONS[action] : 'Coming soon';

  return (
    <ComingSoonScreen
      title={title}
      description="This screen is a placeholder. The full feature will be added in a later step."
      backHref="/owner"
    />
  );
}

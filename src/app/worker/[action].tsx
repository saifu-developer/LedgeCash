import { useLocalSearchParams } from 'expo-router';

import { ComingSoonScreen } from '@/components/dashboard/coming-soon-screen';
import { PaymentEntryScreen } from '@/components/payments/payment-entry-screen';
import { TransactionHistoryScreen } from '@/components/transactions/transaction-history-screen';
import { useCurrentProfile } from '@/session/current-profile';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function WorkerActionScreen() {
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const action = firstParam(params.action);
  const profile = useCurrentProfile();

  if (action === 'cash-in') {
    return <PaymentEntryScreen type="CASH_IN" title="Cash In" />;
  }

  if (action === 'upi-in') {
    return <PaymentEntryScreen type="UPI_IN" title="UPI In" />;
  }

  if (action === 'transactions') {
    if (!profile || profile.role !== 'WORKER') {
      return (
        <ComingSoonScreen
          title="Transactions"
          description="Transaction history is available after worker login."
          backHref="/worker"
        />
      );
    }

    return <TransactionHistoryScreen role="WORKER" profileId={profile.id} />;
  }

  return (
    <ComingSoonScreen
      title="Coming soon"
      description="This screen is a placeholder. The payment form will be added in a later step."
      backHref="/worker"
    />
  );
}

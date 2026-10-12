import { useLocalSearchParams } from 'expo-router';

import { EditTransactionScreen } from '@/components/transactions/edit-transaction-screen';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function OwnerEditTransactionRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const transactionId = firstParam(params.id);

  return <EditTransactionScreen transactionId={transactionId ?? ''} />;
}

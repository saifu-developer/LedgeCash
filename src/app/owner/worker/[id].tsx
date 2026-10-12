import { useLocalSearchParams } from 'expo-router';

import { WorkerDetailScreen } from '@/components/workers/worker-detail-screen';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function OwnerWorkerDetailRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workerId = firstParam(params.id);

  if (!workerId) {
    return <WorkerDetailScreen workerId="" />;
  }

  return <WorkerDetailScreen workerId={workerId} />;
}

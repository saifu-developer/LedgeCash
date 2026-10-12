import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { useUserStore } from '@/store/users';
import type { Profile } from '@/types/profile';

function getInitials(name: string): string {
  return name
    .replace(' (placeholder)', '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function WorkerListScreen() {
  const session = getCurrentProfile();
  const activeShopId = getActiveShopId();
  const { items } = useUserStore();
  const workers = activeShopId
    ? items.filter((user) => user.role === 'WORKER' && user.shopId === activeShopId)
    : [];

  if (!session || session.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Workers</Text>
          <Text style={styles.hint}>Only the owner can manage workers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace('/owner')}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.kicker}>CashManager</Text>
        <Text style={styles.title}>Workers</Text>
        <Text style={styles.hint}>Create and manage shop workers.</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Worker"
          onPress={() =>
            router.push({
              pathname: '/owner/[action]',
              params: { action: 'add-worker' },
            })
          }
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Text style={styles.addButtonText}>+ Add Worker</Text>
        </Pressable>

        {workers.length === 0 ? (
          <Text style={styles.empty}>No workers yet.</Text>
        ) : (
          workers.map((worker) => <WorkerCard key={worker.id} worker={worker} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkerCard({ worker }: { worker: Profile }) {
  const active = worker.status === 'ACTIVE';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${worker.name}, ${active ? 'Active' : 'Inactive'}`}
      onPress={() =>
        router.push({
          pathname: '/owner/worker/[id]',
          params: { id: worker.id },
        })
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(worker.name)}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>{worker.name}</Text>
        <Text style={styles.role}>Worker</Text>
        <Text style={[styles.status, active ? styles.active : styles.inactive]}>
          ● {active ? 'Active' : 'Inactive'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  kicker: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  hint: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 16,
    color: '#6B6B6B',
  },
  addButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  empty: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B6B6B',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECECE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  copy: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  role: {
    marginTop: 2,
    fontSize: 14,
    color: '#6B6B6B',
  },
  status: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  active: {
    color: '#1F7A4D',
  },
  inactive: {
    color: '#B54708',
  },
  pressed: {
    opacity: 0.8,
  },
});

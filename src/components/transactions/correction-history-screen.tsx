import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDate, formatInr, formatTime } from '@/lib/money';
import { transactionTone, transactionTypeLabel } from '@/lib/transactions';
import { getCurrentProfile } from '@/session/current-profile';
import { useAuditStore } from '@/store/audit';
import { getDisplayName } from '@/store/users';
import type { AuditEntry } from '@/types/audit';

function entryTitle(entry: AuditEntry): string {
  const typeLabel = transactionTypeLabel(entry.originalType);
  return entry.action === 'EDIT' ? `Edited ${typeLabel}` : `Deleted ${typeLabel}`;
}

function entryDetail(entry: AuditEntry): string {
  const original = formatInr(entry.originalAmount);
  const createdBy = getDisplayName(entry.createdBy.id, entry.createdBy.name);
  const owner = getDisplayName(entry.correctedBy.id, entry.correctedBy.name);
  const when = `${formatTime(entry.createdAt)} · ${formatDate(entry.createdAt)}`;

  if (entry.action === 'EDIT' && entry.newAmount !== null) {
    return `${original} → ${formatInr(entry.newAmount)} · originally ${createdBy} · by ${owner} · ${when}`;
  }

  return `${original} · originally ${createdBy} · by ${owner} · ${when}`;
}

export function CorrectionHistoryScreen() {
  const session = getCurrentProfile();
  const { items } = useAuditStore();

  if (!session || session.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Correction History</Text>
          <Text style={styles.empty}>Only the owner can view correction history.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sorted = [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace('/owner')}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.kicker}>CashManager</Text>
        <Text style={styles.title}>Correction History</Text>
        <Text style={styles.hint}>Edits and deletions stay here even after a transaction is removed.</Text>

        {sorted.length === 0 ? (
          <Text style={styles.empty}>No corrections yet.</Text>
        ) : (
          <View style={styles.listCard}>
            {sorted.map((entry) => {
              const tone = transactionTone[entry.originalType];
              return (
                <View key={entry.id} style={styles.row}>
                  <View style={[styles.badge, { backgroundColor: tone.background }]}>
                    <Text style={[styles.badgeText, { color: tone.accent }]}>{entry.action}</Text>
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.rowTitle}>{entryTitle(entry)}</Text>
                    <Text style={styles.meta}>{entryDetail(entry)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  content: {
    paddingHorizontal: 20,
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
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  hint: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B6B6B',
  },
  listCard: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  meta: {
    marginTop: 3,
    fontSize: 13,
    color: '#6B6B6B',
  },
  empty: {
    marginTop: 36,
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});

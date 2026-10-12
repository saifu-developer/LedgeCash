import { StyleSheet, Text, View } from 'react-native';

type StatCardProps = {
  label: string;
  value: string;
  accent?: string;
  background?: string;
};

export function StatCard({
  label,
  value,
  accent = '#1A1A1A',
  background = '#FFFFFF',
}: StatCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: accent }]}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '700',
  },
});

import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/AppCard';

type StatCardProps = {
  label: string;
  value: string;
  accent?: string;
  icon?: ReactNode;
  subtitle?: string;
  iconBg?: string;
  background?: string;
};

export function StatCard({
  label,
  value,
  icon,
  subtitle,
  iconBg = '#F8FAFC',
  background,
}: StatCardProps) {
  return (
    <AppCard style={[styles.card, background ? { backgroundColor: background } : null]}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>
        {icon ? (
          <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
            {icon}
          </View>
        ) : null}
      </View>
      <View style={styles.bottomSection}>
        <Text style={styles.value}>{value}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 96,
    padding: 14,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  bottomSection: {
    marginTop: 8,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
});

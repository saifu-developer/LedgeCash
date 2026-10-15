import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionRow } from '@/components/dashboard/transaction-row';
import { AppCard } from '@/components/ui/AppCard';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { BrandColors } from '@/constants/theme';
import { formatInr } from '@/lib/money';
import { transactionTone } from '@/lib/transactions';
import { useCurrentProfile } from '@/session/current-profile';
import {
  clearSuccessNotice,
  getTodayOverviewForUser,
  getWorkerPayments,
  useTransactionStore,
} from '@/store/transactions';

export default function WorkerHomeScreen() {
  const router = useRouter();
  const profile = useCurrentProfile();
  const { notice } = useTransactionStore();

  useEffect(() => {
    if (!profile) {
      router.replace('/');
    }
  }, [profile, router]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = setTimeout(() => {
      clearSuccessNotice();
    }, 2800);

    return () => clearTimeout(timeout);
  }, [notice]);

  if (!profile) {
    return null;
  }

  const overview = getTodayOverviewForUser(profile.id);
  const recent = getWorkerPayments(profile.id).slice(0, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header in AppCard */}
        <AppCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <View style={styles.brandLogoBox}>
                <Image
                  source={require('@/assets/logo_icon.png')}
                  style={styles.brandLogoIcon}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandTitle}>LedgeCash</Text>
            </View>
            <SyncStatusBadge />
          </View>
          <View style={styles.workerProfileRow}>
            <View style={styles.workerAvatar}>
              <Ionicons name="person" size={20} color={BrandColors.green} />
            </View>
            <View>
              <Text style={styles.workerRoleLabel}>STAFF MEMBER</Text>
              <Text style={styles.name}>{profile.name}</Text>
            </View>
          </View>
        </AppCard>

        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="checkmark-circle" size={18} color="#1F7A4D" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Today&apos;s Collections</Text>
        <View style={styles.stats}>
          <StatCard
            label="Cash In"
            value={formatInr(overview.cashIn)}
            accent={transactionTone.CASH_IN.accent}
            icon={
              <Ionicons
                name="arrow-down-circle"
                size={18}
                color={transactionTone.CASH_IN.accent}
              />
            }
            iconBg="#ECFDF5"
          />
          <StatCard
            label="UPI In"
            value={formatInr(overview.upiIn)}
            accent={transactionTone.UPI_IN.accent}
            icon={
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color={transactionTone.UPI_IN.accent}
              />
            }
            iconBg="#EFF6FF"
          />
        </View>

        {/* Total In Card */}
        <AppCard style={styles.totalCard}>
          <View style={styles.totalTopRow}>
            <Text style={styles.totalLabel}>Total Collected Today</Text>
            <Ionicons name="trending-up" size={18} color={BrandColors.green} />
          </View>
          <Text style={styles.totalValue}>{formatInr(overview.totalIn)}</Text>
        </AppCard>

        {/* Primary Action Buttons */}
        <View style={styles.actionGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cash In"
            onPress={() =>
              router.push({
                pathname: '/worker/[action]',
                params: { action: 'cash-in' },
              })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: transactionTone.CASH_IN.accent },
              pressed && styles.pressed,
            ]}>
            <View style={styles.btnIconCircle}>
              <Ionicons name="arrow-down" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.primaryButtonText}>Cash In</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="UPI In"
            onPress={() =>
              router.push({
                pathname: '/worker/[action]',
                params: { action: 'upi-in' },
              })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: transactionTone.UPI_IN.accent },
              pressed && styles.pressed,
            ]}>
            <View style={styles.btnIconCircle}>
              <Ionicons name="phone-portrait-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.primaryButtonText}>UPI In</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelInline}>My Recent Payments</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
            onPress={() =>
              router.push({
                pathname: '/worker/[action]',
                params: { action: 'transactions' },
              })
            }
            style={({ pressed }) => [styles.seeAllBtn, pressed && styles.pressed]}>
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={BrandColors.green} />
          </Pressable>
        </View>

        <AppCard style={styles.listCard} noPadding>
          {recent.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
              <Text style={styles.empty}>No payments recorded yet today.</Text>
            </View>
          ) : (
            recent.map((transaction, idx) => (
              <View
                key={transaction.id}
                style={[
                  styles.transactionItemWrapper,
                  idx < recent.length - 1 && styles.transactionItemBorder,
                ]}>
                <TransactionRow
                  transaction={transaction}
                  showEnteredBy={false}
                  showDate
                />
              </View>
            ))
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  headerCard: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoIcon: {
    width: 32,
    height: 32,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  workerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  workerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerRoleLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#94A3B8',
  },
  name: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    flex: 1,
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabelInline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.green,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  totalCard: {
    marginBottom: 18,
  },
  totalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  totalValue: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    color: BrandColors.navy,
    letterSpacing: -0.5,
  },
  actionGroup: {
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  btnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCard: {
    marginBottom: 20,
  },
  transactionItemWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  transactionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  empty: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});

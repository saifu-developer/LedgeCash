import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopSwitcherModal } from '@/components/dashboard/ShopSwitcherModal';
import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionRow } from '@/components/dashboard/transaction-row';
import { OwnerBottomNav } from '@/components/navigation/OwnerBottomNav';
import { AppCard } from '@/components/ui/AppCard';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { BrandColors } from '@/constants/theme';
import { formatInr } from '@/lib/money';
import { transactionTone } from '@/lib/transactions';
import {
  useActiveShop,
  useActiveShopId,
  useCurrentProfile,
} from '@/session/current-profile';
import {
  clearSuccessNotice,
  getRecentTransactions,
  getTodayOverview,
  useTransactionStore,
} from '@/store/transactions';

function greetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export default function OwnerHomeScreen() {
  const router = useRouter();
  const profile = useCurrentProfile();
  const activeShopId = useActiveShopId();
  const activeShop = useActiveShop();
  const { notice } = useTransactionStore();

  const [shopSwitcherVisible, setShopSwitcherVisible] = useState(false);

  useEffect(() => {
    if (!profile) {
      router.replace('/');
    }
  }, [profile, router]);

  useEffect(() => {
    if (profile && profile.role === 'OWNER' && !activeShopId) {
      router.replace('/shop-setup');
    }
  }, [profile, activeShopId, router]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = setTimeout(() => {
      clearSuccessNotice();
    }, 2800);

    return () => clearTimeout(timeout);
  }, [notice]);

  if (!profile || !activeShopId) {
    return null;
  }

  const overview = getTodayOverview();
  const recent = getRecentTransactions(8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Top Header & Greeting block inside standardized AppCard */}
        <AppCard style={styles.headerCard}>
          <View style={styles.headerTopRow}>
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

          <View style={styles.greetingContainer}>
            <Text style={styles.greetingText}>
              {greetingPrefix()},{' '}
              <Text style={styles.greetingName}>{profile.name}</Text>
            </Text>
          </View>

          {/* Active Shop Indicator directly below greeting */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Active Shop: ${activeShop?.name ?? 'Main Shop'}, Code ${activeShop?.id ?? activeShopId}. Tap to switch shop.`}
            onPress={() => setShopSwitcherVisible(true)}
            style={({ pressed }) => [
              styles.shopIndicatorPill,
              pressed && styles.pressed,
            ]}>
            <View style={styles.shopIconContainer}>
              <Ionicons name="storefront" size={16} color={BrandColors.green} />
            </View>

            <View style={styles.shopNameCol}>
              <Text style={styles.shopNameKicker}>ACTIVE SHOP</Text>
              <Text style={styles.activeShopName} numberOfLines={1}>
                {activeShop?.name ?? 'Main Shop'}
              </Text>
            </View>

            <View style={styles.shopCodeBadge}>
              <Text style={styles.shopCodeBadgeText}>
                {activeShop?.id ?? activeShopId}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={14}
              color="#94A3B8"
              style={styles.shopChevron}
            />
          </Pressable>
        </AppCard>

        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="checkmark-circle" size={18} color="#1F7A4D" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* Section: Today's Overview */}
        <Text style={styles.sectionLabel}>Today&apos;s Overview</Text>

        <View style={styles.overviewGrid}>
          <StatCard
            label="Cash In"
            value={formatInr(overview.cashIn)}
            accent="#10B981"
            icon={
              <Ionicons
                name="arrow-down-circle"
                size={18}
                color="#10B981"
              />
            }
            iconBg="#ECFDF5"
          />
          <StatCard
            label="UPI In"
            value={formatInr(overview.upiIn)}
            accent="#2563EB"
            icon={
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color="#2563EB"
              />
            }
            iconBg="#EFF6FF"
          />
        </View>

        <View style={styles.overviewGrid}>
          <StatCard
            label="Total In"
            value={formatInr(overview.totalIn)}
            accent="#0EA5E9"
            icon={
              <Ionicons
                name="trending-up"
                size={18}
                color="#0EA5E9"
              />
            }
            iconBg="#F0F9FF"
          />
          <StatCard
            label="Cash Out"
            value={formatInr(overview.cashOut)}
            accent="#F97316"
            icon={
              <Ionicons
                name="arrow-up-circle"
                size={18}
                color="#F97316"
              />
            }
            iconBg="#FFF7ED"
          />
        </View>

        {/* Hero Net Till Balance Card with prominent high-contrast Navy styling */}
        <AppCard
          variant="heroNavy"
          style={styles.balanceHeroCard}>
          <View style={styles.balanceHeaderRow}>
            <View style={styles.balanceTitleGroup}>
              <View style={styles.balanceIconBox}>
                <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.balanceLabel}>Net Till Balance</Text>
            </View>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          <Text style={styles.balanceValue}>{formatInr(overview.balance)}</Text>

          <View style={styles.balanceFooterRow}>
            <Text style={styles.balanceSubtext}>
              In: {formatInr(overview.totalIn)} · Out: {formatInr(overview.cashOut)}
            </Text>
          </View>
        </AppCard>

        {/* Primary Action Buttons (Cash In, UPI In, Cash Out) */}
        <View style={styles.primaryActionGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cash In"
            onPress={() =>
              router.push({
                pathname: '/owner/[action]',
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
                pathname: '/owner/[action]',
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cash Out"
            onPress={() =>
              router.push({
                pathname: '/owner/[action]',
                params: { action: 'cash-out' },
              })
            }
            style={({ pressed }) => [
              styles.cashOutButton,
              pressed && styles.pressed,
            ]}>
            <View style={styles.btnIconCircle}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.cashOutButtonText}>Cash Out</Text>
          </Pressable>
        </View>

        {/* Section: Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelInline}>Recent Transactions</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
            onPress={() =>
              router.push({
                pathname: '/owner/[action]',
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
              <Text style={styles.empty}>No transactions recorded today.</Text>
            </View>
          ) : (
            recent.map((transaction, idx) => (
              <View
                key={transaction.id}
                style={[
                  styles.transactionItemWrapper,
                  idx < recent.length - 1 && styles.transactionItemBorder,
                ]}>
                <TransactionRow transaction={transaction} />
              </View>
            ))
          )}
        </AppCard>
      </ScrollView>

      {/* Switch Shop Drawer / Modal */}
      <ShopSwitcherModal
        visible={shopSwitcherVisible}
        onClose={() => setShopSwitcherVisible(false)}
      />

      {/* Fixed Modern 5-Tab Bottom Navigation Bar */}
      <OwnerBottomNav activeTab="home" />
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
    paddingBottom: 110,
  },
  headerCard: {
    marginBottom: 20,
  },
  headerTopRow: {
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
  greetingContainer: {
    marginBottom: 12,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#4B5563',
  },
  greetingName: {
    fontWeight: '800',
    color: BrandColors.navy,
  },
  shopIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  shopIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  shopNameCol: {
    flex: 1,
  },
  shopNameKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#94A3B8',
  },
  activeShopName: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginTop: 1,
  },
  shopCodeBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginRight: 6,
  },
  shopCodeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  shopChevron: {
    marginLeft: 2,
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
  overviewGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  balanceHeroCard: {
    marginBottom: 20,
    marginTop: 4,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.3,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.5,
  },
  balanceValue: {
    marginTop: 12,
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  balanceFooterRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  balanceSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },
  primaryActionGroup: {
    gap: 10,
    marginBottom: 20,
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
  cashOutButton: {
    minHeight: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: transactionTone.CASH_OUT.accent,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  cashOutButtonText: {
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

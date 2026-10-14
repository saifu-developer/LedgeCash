import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { exportLedgerCsv } from '@/lib/export-utils';
import { formatDate, formatInr } from '@/lib/money';
import {
  generateFinancialReport,
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
} from '@/lib/reports';
import { transactionTone } from '@/lib/transactions';
import { useActiveShop } from '@/session/current-profile';
import { useTransactionStore } from '@/store/transactions';

const PERIOD_KEYS: ReportPeriod[] = ['today', 'week', 'month', 'last_month', 'custom'];

function getInitials(name: string): string {
  return name
    .replace(' (placeholder)', '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ReportsScreen() {
  const activeShop = useActiveShop();
  const { items: allTransactions } = useTransactionStore();

  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [customDays, setCustomDays] = useState<number>(7);
  const [exporting, setExporting] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Compute custom date range based on selected preset days
  const customRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (customDays - 1));
    return { start, end };
  }, [customDays]);

  // Generate real-time financial report data
  const report = useMemo(() => {
    return generateFinancialReport(
      allTransactions,
      period,
      period === 'custom' ? customRange : undefined
    );
  }, [allTransactions, period, customRange]);

  const dateRangeSubtitle = useMemo(() => {
    const s = formatDate(report.dateRange.start.toISOString());
    const e = formatDate(report.dateRange.end.toISOString());
    return s === e ? s : `${s} – ${e}`;
  }, [report.dateRange]);

  async function handleExportCsv() {
    if (exporting) return;
    if (report.filteredTransactions.length === 0) {
      const msg = 'No transactions found for the selected period to export.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Export Ledger', msg);
      }
      return;
    }

    setExporting(true);
    setNotice(null);

    const result = await exportLedgerCsv(report.filteredTransactions, {
      shopName: activeShop?.name ?? 'Shop',
      periodLabel: REPORT_PERIOD_LABELS[period],
    });

    setExporting(false);

    if (result.success) {
      setNotice(result.message ?? 'CSV Export complete!');
      setTimeout(() => setNotice(null), 3500);
    } else {
      const err = result.message ?? 'Failed to export CSV.';
      if (Platform.OS === 'web') {
        window.alert(err);
      } else {
        Alert.alert('Export Error', err);
      }
    }
  }

  const isPositiveBalance = report.netProfit >= 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to owner dashboard"
            onPress={() => router.replace('/owner')}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          {activeShop ? (
            <View style={styles.shopBadge}>
              <Text style={styles.shopBadgeText} numberOfLines={1}>
                {activeShop.name} · {activeShop.id}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.titleContainer}>
          <View>
            <Text style={styles.kicker}>CashManager</Text>
            <Text style={styles.title}>Financial Reports</Text>
            <Text style={styles.dateSubtitle}>{dateRangeSubtitle}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export Ledger CSV"
            onPress={handleExportCsv}
            disabled={exporting}
            style={({ pressed }) => [styles.exportButton, (pressed || exporting) && styles.pressed]}>
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.exportButtonText}>Export CSV</Text>
            )}
          </Pressable>
        </View>

        {notice ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* Date Filter Selector */}
        <View style={styles.filtersScroll}>
          {PERIOD_KEYS.map((key) => {
            const isSelected = key === period;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Select period ${REPORT_PERIOD_LABELS[key]}`}
                onPress={() => setPeriod(key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.filterText, isSelected && styles.filterTextSelected]}>
                  {REPORT_PERIOD_LABELS[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom Range Presets */}
        {period === 'custom' ? (
          <View style={styles.customPresetsCard}>
            <Text style={styles.customPresetLabel}>Custom Preset Range:</Text>
            <View style={styles.presetButtonsRow}>
              {[7, 14, 30, 90].map((days) => {
                const isSelected = customDays === days;
                return (
                  <Pressable
                    key={days}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setCustomDays(days)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      isSelected && styles.presetChipSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                      Last {days}D
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Hero Card: Net Cash Flow / Net Profit */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>Net Profit / Cash Balance</Text>
            <View
              style={[
                styles.badgeStatus,
                isPositiveBalance ? styles.badgeSurplus : styles.badgeDeficit,
              ]}>
              <Text
                style={[
                  styles.badgeStatusText,
                  isPositiveBalance ? styles.badgeSurplusText : styles.badgeDeficitText,
                ]}>
                {isPositiveBalance ? 'Surplus' : 'Deficit'}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.heroAmount,
              { color: isPositiveBalance ? '#FFFFFF' : '#FF6B6B' },
            ]}>
            {formatInr(report.netProfit)}
          </Text>
          <Text style={styles.heroSubtext}>
            Inflow: {formatInr(report.totalInflow)} · Outflow: {formatInr(report.totalOutflow)}
          </Text>
        </View>

        {/* Inflow vs Outflow Dual Cards */}
        <View style={styles.metricGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Inflow</Text>
            <Text style={[styles.metricValue, { color: transactionTone.CASH_IN.accent }]}>
              {formatInr(report.totalInflow)}
            </Text>
            <View style={styles.metricSubrows}>
              <Text style={styles.metricDetail}>
                Cash In: <Text style={styles.metricBold}>{formatInr(report.totalCashIn)}</Text>
              </Text>
              <Text style={styles.metricDetail}>
                UPI In: <Text style={styles.metricBold}>{formatInr(report.totalUpiIn)}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Outflow</Text>
            <Text style={[styles.metricValue, { color: transactionTone.CASH_OUT.accent }]}>
              {formatInr(report.totalOutflow)}
            </Text>
            <View style={styles.metricSubrows}>
              <Text style={styles.metricDetail}>
                Expenses: <Text style={styles.metricBold}>{report.categoryExpenses.length} categories</Text>
              </Text>
              <Text style={styles.metricDetail}>
                Total Txns: <Text style={styles.metricBold}>{report.transactionCount}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* UPI vs Cash Ratio Split Bar Card */}
        <View style={styles.cardContainer}>
          <Text style={styles.cardSectionTitle}>Collection Method Split</Text>
          <View style={styles.ratioHeader}>
            <View style={styles.ratioLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: transactionTone.CASH_IN.accent }]} />
              <Text style={styles.ratioLegendText}>
                Cash In: {report.cashRatio}% ({formatInr(report.totalCashIn)})
              </Text>
            </View>
            <View style={styles.ratioLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: transactionTone.UPI_IN.accent }]} />
              <Text style={styles.ratioLegendText}>
                UPI In: {report.upiRatio}% ({formatInr(report.totalUpiIn)})
              </Text>
            </View>
          </View>

          {report.totalInflow > 0 ? (
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barSegment,
                  {
                    flex: Math.max(report.cashRatio, 1),
                    backgroundColor: transactionTone.CASH_IN.accent,
                  },
                ]}
              />
              <View
                style={[
                  styles.barSegment,
                  {
                    flex: Math.max(report.upiRatio, 1),
                    backgroundColor: transactionTone.UPI_IN.accent,
                  },
                ]}
              />
            </View>
          ) : (
            <View style={[styles.barTrack, styles.barTrackEmpty]}>
              <Text style={styles.emptyBarText}>No inflows recorded in this period</Text>
            </View>
          )}
        </View>

        {/* Category Expense Breakdown */}
        <View style={styles.cardContainer}>
          <View style={styles.cardSectionHeader}>
            <Text style={styles.cardSectionTitle}>Expense Breakdown by Category</Text>
            <Text style={styles.countBadge}>
              {report.categoryExpenses.length} {report.categoryExpenses.length === 1 ? 'category' : 'categories'}
            </Text>
          </View>

          {report.categoryExpenses.length === 0 ? (
            <Text style={styles.emptyListText}>No expenses recorded for this period.</Text>
          ) : (
            report.categoryExpenses.map((cat) => (
              <View key={cat.category} style={styles.categoryItem}>
                <View style={styles.categoryInfoRow}>
                  <Text style={styles.categoryName}>{cat.category}</Text>
                  <Text style={styles.categoryAmount}>{formatInr(cat.amount)}</Text>
                </View>

                <View style={styles.categorySubRow}>
                  <Text style={styles.categoryMeta}>
                    {cat.count} {cat.count === 1 ? 'entry' : 'entries'} · {cat.percentage.toFixed(1)}% of expenses
                  </Text>
                </View>

                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(Math.max(cat.percentage, 3), 100)}%`,
                        backgroundColor: transactionTone.CASH_OUT.accent,
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Worker Collection Breakdown */}
        <View style={styles.cardContainer}>
          <View style={styles.cardSectionHeader}>
            <Text style={styles.cardSectionTitle}>Worker Collection Breakdown</Text>
            <Text style={styles.countBadge}>
              {report.workerCollections.length} {report.workerCollections.length === 1 ? 'staff member' : 'staff members'}
            </Text>
          </View>

          {report.workerCollections.length === 0 ? (
            <Text style={styles.emptyListText}>No collections recorded by workers for this period.</Text>
          ) : (
            report.workerCollections.map((worker) => (
              <View key={worker.workerId} style={styles.workerItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(worker.workerName)}</Text>
                </View>

                <View style={styles.workerDetails}>
                  <View style={styles.workerTopRow}>
                    <Text style={styles.workerName}>{worker.workerName}</Text>
                    <Text style={styles.workerTotal}>{formatInr(worker.totalCollected)}</Text>
                  </View>

                  <Text style={styles.workerSubRow}>
                    Cash: {formatInr(worker.cashIn)} · UPI: {formatInr(worker.upiIn)} · {worker.transactionCount}{' '}
                    {worker.transactionCount === 1 ? 'txn' : 'txns'}
                  </Text>

                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(Math.max(worker.percentageOfTotal, 3), 100)}%`,
                          backgroundColor: BrandColors.green,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.workerPercentage}>
                    {worker.percentageOfTotal.toFixed(1)}% of total shop inflow
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  shopBadge: {
    backgroundColor: '#EAEAE6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '65%',
  },
  shopBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  dateSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B6B6B',
    fontWeight: '500',
  },
  exportButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeBox: {
    backgroundColor: '#E8F6EE',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A4D',
    textAlign: 'center',
  },
  filtersScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  filterChipSelected: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  filterTextSelected: {
    color: '#FFFFFF',
  },
  customPresetsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  customPresetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A86',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F7F7F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  presetChipSelected: {
    backgroundColor: BrandColors.green,
    borderColor: BrandColors.green,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  presetChipTextSelected: {
    color: '#FFFFFF',
  },
  heroCard: {
    backgroundColor: BrandColors.navy,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C8C8C2',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSurplus: {
    backgroundColor: 'rgba(31, 122, 77, 0.35)',
  },
  badgeDeficit: {
    backgroundColor: 'rgba(180, 35, 24, 0.4)',
  },
  badgeStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeSurplusText: {
    color: '#4ADE80',
  },
  badgeDeficitText: {
    color: '#F87171',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  heroSubtext: {
    fontSize: 14,
    color: '#B0B4BA',
    marginTop: 4,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A86',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '700',
  },
  metricSubrows: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0EC',
    paddingTop: 8,
    gap: 2,
  },
  metricDetail: {
    fontSize: 12,
    color: '#6B6B6B',
  },
  metricBold: {
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 12,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A86',
    marginBottom: 12,
  },
  ratioHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  ratioLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ratioLegendText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  barTrack: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#EBEBE6',
  },
  barTrackEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  emptyBarText: {
    fontSize: 11,
    color: '#8A8A86',
  },
  barSegment: {
    height: '100%',
  },
  categoryItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F0',
  },
  categoryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: transactionTone.CASH_OUT.accent,
  },
  categorySubRow: {
    marginTop: 2,
  },
  categoryMeta: {
    fontSize: 12,
    color: '#8A8A86',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F0F0EB',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  workerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F0',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  workerDetails: {
    flex: 1,
  },
  workerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  workerTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.green,
  },
  workerSubRow: {
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 2,
  },
  workerPercentage: {
    fontSize: 11,
    color: '#8A8A86',
    fontWeight: '500',
    marginTop: 4,
  },
  emptyListText: {
    fontSize: 14,
    color: '#8A8A86',
    paddingVertical: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResetConfirmModal } from '@/components/ui/ResetConfirmModal';
import { BrandColors } from '@/constants/theme';
import { resetAllAppData } from '@/lib/reset-app';
import { useUserStore } from '@/store/users';

export default function WelcomeScreen() {
  const router = useRouter();
  const { items } = useUserStore();
  const owner = items.find((u) => u.role === 'OWNER' && u.status === 'ACTIVE');

  const [devResetModalVisible, setDevResetModalVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState<string | null>(null);

  function handleOwnerCardPress() {
    if (owner) {
      // Direct navigation to PIN screen for existing owner
      router.push({
        pathname: '/pin',
        params: { profileId: owner.id },
      });
    } else {
      // First-time owner onboarding
      router.push('/owner-setup');
    }
  }

  function handleWorkerCardPress() {
    router.push('/worker-login');
  }

  async function handleConfirmDevReset() {
    setResetting(true);
    try {
      await resetAllAppData();
      setDevResetModalVisible(false);
      setResetSuccessNotice('App state wiped. Ready for fresh onboarding.');
      setTimeout(() => setResetSuccessNotice(null), 4000);
    } catch (e) {
      console.error('Failed to reset app:', e);
    } finally {
      setResetting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Hero Branding Header */}
        <View style={styles.heroSection}>
          <View style={styles.logoBadgeContainer}>
            <Image
              source={require('@/assets/images/logo-icon.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>LedgeCash</Text>
          <Text style={styles.brandSubtitle}>
            Smart Multi-User Cash & Expense Management
          </Text>

          {/* Fintech Value Badges */}
          <View style={styles.badgeRow}>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>⚡ Offline-First</Text>
            </View>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>🏪 Multi-Shop</Text>
            </View>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>🔒 Multi-User PIN</Text>
            </View>
          </View>
        </View>

        {/* Mode Selection Cards */}
        <View style={styles.cardsContainer}>
          <Text style={styles.sectionHeading}>SELECT YOUR PORTAL</Text>

          {resetSuccessNotice ? (
            <View style={styles.noticeBanner}>
              <Text style={styles.noticeText}>✓ {resetSuccessNotice}</Text>
            </View>
          ) : null}

          {/* Business Owner Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              owner
                ? `Business Owner, log in as ${owner.name}`
                : 'Business Owner, set up master account'
            }
            onPress={handleOwnerCardPress}
            style={({ pressed }) => [
              styles.portalCard,
              styles.ownerCardBorder,
              pressed && styles.cardPressed,
            ]}>
            <View style={[styles.iconBox, styles.ownerIconBox]}>
              <Text style={styles.portalIcon}>🏪</Text>
            </View>

            <View style={styles.portalContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.portalTitle}>Business Owner</Text>
                {owner ? (
                  <View style={styles.activeAccountBadge}>
                    <Text style={styles.activeAccountText}>CONFIGURED</Text>
                  </View>
                ) : (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>GET STARTED</Text>
                  </View>
                )}
              </View>

              <Text style={styles.portalTagline}>
                Manage shops, view analytics & control till
              </Text>

              <View style={styles.actionPromptRow}>
                <Text style={styles.ownerActionPrompt}>
                  {owner
                    ? `Log in as ${owner.name} with PIN →`
                    : 'Set up master business profile →'}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Staff / Worker Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Staff or Worker, log daily cash and UPI collections"
            onPress={handleWorkerCardPress}
            style={({ pressed }) => [
              styles.portalCard,
              styles.workerCardBorder,
              pressed && styles.cardPressed,
            ]}>
            <View style={[styles.iconBox, styles.workerIconBox]}>
              <Text style={styles.portalIcon}>🧑‍💼</Text>
            </View>

            <View style={styles.portalContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.portalTitle}>Staff / Worker</Text>
                <View style={styles.workerBadge}>
                  <Text style={styles.workerBadgeText}>DAILY LOGS</Text>
                </View>
              </View>

              <Text style={styles.portalTagline}>
                Log daily cash & UPI collections
              </Text>

              <View style={styles.actionPromptRow}>
                <Text style={styles.workerActionPrompt}>
                  Enter shop code & worker PIN →
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* Developer Reset Section (Visible in DEV mode) */}
        {__DEV__ && (
          <View style={styles.devSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Developer Reset: wipe all local app data"
              onPress={() => setDevResetModalVisible(true)}
              style={({ pressed }) => [
                styles.devResetButton,
                pressed && styles.cardPressed,
              ]}>
              <Text style={styles.devResetIcon}>⚙️</Text>
              <Text style={styles.devResetText}>
                Dev Mode: Reset All App State & Database
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <ResetConfirmModal
        visible={devResetModalVisible}
        onClose={() => setDevResetModalVisible(false)}
        onConfirm={handleConfirmDevReset}
        title="Developer: Reset All Data?"
        message="This will completely clear SQLite tables (shops, transactions, audit, sync_meta), wipe AsyncStorage, and invalidate the session so you can test fresh registration."
        confirmLabel="Reset Everything"
        loading={resetting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  heroSection: {
    backgroundColor: BrandColors.navy,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 24 : 40,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  logoBadgeContainer: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  logoIcon: {
    width: 48,
    height: 48,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  brandSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#D1D5DB',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  pillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pillText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  cardsContainer: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 16,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  noticeBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065F46',
    textAlign: 'center',
  },
  portalCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#062650',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  ownerCardBorder: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  workerCardBorder: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  ownerIconBox: {
    backgroundColor: '#EEF2F6',
  },
  workerIconBox: {
    backgroundColor: '#ECFDF5',
  },
  portalIcon: {
    fontSize: 28,
  },
  portalContent: {
    flex: 1,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  activeAccountBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeAccountText: {
    fontSize: 10,
    fontWeight: '800',
    color: BrandColors.green,
    letterSpacing: 0.4,
  },
  newBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.4,
  },
  workerBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  workerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.4,
  },
  portalTagline: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  actionPromptRow: {
    marginTop: 4,
  },
  ownerActionPrompt: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  workerActionPrompt: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.green,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  devSection: {
    marginTop: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  devResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  devResetIcon: {
    fontSize: 14,
  },
  devResetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
});

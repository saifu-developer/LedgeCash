import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { createShopWithCloud, switchShopWithCloud } from '@/lib/auth-service';
import {
  getActiveShopId,
  getCurrentProfile,
  setCurrentProfile,
} from '@/session/current-profile';
import { getShopsByOwner, useShopStore } from '@/store/shops';
import { useUserStore } from '@/store/users';
import type { Shop } from '@/types/shop';

export default function ShopSetupScreen() {
  const params = useLocalSearchParams<{ ownerId?: string }>();
  useShopStore(); // Reactive subscription to shop updates
  const { items: allUsers } = useUserStore();

  const currentProfile = getCurrentProfile();
  const ownerId =
    params.ownerId ||
    currentProfile?.id ||
    allUsers.find((u) => u.role === 'OWNER' && u.status === 'ACTIVE')?.id;

  const ownerUser = allUsers.find((u) => u.id === ownerId);
  const ownedShops = ownerId ? getShopsByOwner(ownerId) : [];
  const currentActiveShopId = getActiveShopId();

  const [shopName, setShopName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switchingShopId, setSwitchingShopId] = useState<string | null>(null);

  // Auto-login session profile if not already set
  if (ownerUser && (!currentProfile || currentProfile.id !== ownerUser.id)) {
    setCurrentProfile(ownerUser);
  }

  async function handleSelectShop(shop: Shop) {
    if (switchingShopId) return;
    setSwitchingShopId(shop.id);
    setError(null);
    try {
      await switchShopWithCloud(shop.id);
      router.replace('/owner');
    } catch (e: any) {
      setError(e?.message || 'Failed to select shop.');
      setSwitchingShopId(null);
    }
  }

  async function handleCreateShop() {
    const trimmed = shopName.trim();
    if (!trimmed) {
      setError('Please enter a shop name.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessNotice(null);

    try {
      // Create shop via cloud API without sending ownerId
      const newShop = await createShopWithCloud(trimmed);

      // If owner has no previous active shops, set it as active and launch dashboard
      if (!currentActiveShopId || ownedShops.length === 0) {
        await switchShopWithCloud(newShop.id);
        router.replace('/owner');
        return;
      }

      // Otherwise, preserve existing active shop and prompt user
      setShopName('');
      setSubmitting(false);
      setSuccessNotice(`Shop "${newShop.name}" created! Tap below to switch, or return to dashboard.`);
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message || 'Failed to create shop.');
    }
  }


  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>← Switch Account</Text>
          </Pressable>

          <View style={styles.header}>
            <Image
              source={require('@/assets/images/logo-full.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Create or Select Shop</Text>
            <Text style={styles.subtitle}>
              {ownerUser
                ? `Welcome, ${ownerUser.name}. Select a shop or create a new one.`
                : 'Select an existing shop or set up a new branch.'}
            </Text>
          </View>

          {/* Section A: Existing Shops */}
          {ownedShops.length > 0 ? (
            <View style={styles.existingSection}>
              <Text style={styles.sectionTitle}>Your Existing Shops</Text>
              <View style={styles.shopList}>
                {ownedShops.map((shop) => {
                  const isActive = shop.id === currentActiveShopId;
                  const isSwitchingThis = switchingShopId === shop.id;

                  return (
                    <Pressable
                      key={shop.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${shop.name}`}
                      disabled={Boolean(switchingShopId)}
                      onPress={() => handleSelectShop(shop)}
                      style={({ pressed }) => [
                        styles.shopCard,
                        isActive && styles.activeShopCard,
                        (pressed || isSwitchingThis) && styles.pressed,
                      ]}>
                      <View style={styles.shopCardLeft}>
                        <Text style={styles.shopCardName}>{shop.name}</Text>
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{shop.id}</Text>
                        </View>
                      </View>
                      <View style={styles.shopCardRight}>
                        {isSwitchingThis ? (
                          <ActivityIndicator size="small" color={BrandColors.navy} />
                        ) : (
                          <Text style={styles.selectText}>
                            {isActive ? 'Active →' : 'Select →'}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Section B: Create New Shop */}
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>
              {ownedShops.length > 0 ? 'Create Another Shop' : 'Set Up Your First Shop'}
            </Text>
            <Text style={styles.createHint}>
              Enter the business or branch name. A unique shop code (e.g. LC-XXXXXX) will be generated.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Irfan's Kirana Store"
              placeholderTextColor="#A0A09A"
              value={shopName}
              onChangeText={(text) => {
                setError(null);
                setSuccessNotice(null);
                setShopName(text);
              }}
              autoCapitalize="words"
              editable={!submitting}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {successNotice ? <Text style={styles.successText}>{successNotice}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Shop"
              onPress={handleCreateShop}
              disabled={submitting}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {ownedShops.length > 0 ? 'Create Shop' : 'Create Shop & Open Dashboard'}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  flex: {
    flex: 1,
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
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 200,
    height: 52,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B6B6B',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  existingSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#6B6B66',
    marginBottom: 10,
  },
  shopList: {
    gap: 10,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#EFEFEA',
  },
  activeShopCard: {
    borderColor: BrandColors.green,
    backgroundColor: '#F7FDF9',
  },
  shopCardLeft: {
    flex: 1,
    gap: 4,
  },
  shopCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  codeBadge: {
    backgroundColor: '#F0F0EC',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555550',
    letterSpacing: 0.5,
  },
  shopCardRight: {
    marginLeft: 12,
  },
  selectText: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.green,
  },
  createCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  createHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#70706B',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#FAFAF8',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: BrandColors.navy,
    borderWidth: 1,
    borderColor: '#E5E5E0',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  successText: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});


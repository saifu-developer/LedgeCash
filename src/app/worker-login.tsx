import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import {
  fetchShopAndWorkersFromCloud,
  getLastWorkerShopId,
  type WorkerSummary,
} from '@/lib/auth-service';
import { getWorkersByShop } from '@/store/users';
import type { Profile } from '@/types/profile';
import type { Shop } from '@/types/shop';

function getInitials(name: string): string {
  return name
    .replace(' (placeholder)', '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ProfileCard({
  profile,
  onPress,
}: {
  profile: Profile | WorkerSummary;
  onPress: (profile: Profile | WorkerSummary) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Select ${profile.name}, Worker`}
      onPress={() => onPress(profile)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardName}>{profile.name}</Text>
        <Text style={styles.cardRole}>Worker</Text>
      </View>
    </Pressable>
  );
}

export default function WorkerLoginScreen() {
  const router = useRouter();
  const [shopIdInput, setShopIdInput] = useState('');
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const savedShopId = await getLastWorkerShopId();
      if (mounted && savedShopId) {
        setShopIdInput((current) => current || savedShopId);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleValidateShop() {
    setError(null);
    const normalized = shopIdInput.trim().toUpperCase();
    if (!normalized) {
      setError('Please enter a Shop ID.');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchShopAndWorkersFromCloud(normalized);
      setCurrentShop({
        id: data.shopId,
        name: data.shopName,
        ownerId: data.ownerId || '',
        createdAt: new Date().toISOString(),
      });
      setWorkers(data.workers || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to verify shop. Please try again.');
      setCurrentShop(null);
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }

  function handleResetShop() {
    setCurrentShop(null);
    setWorkers([]);
    setError(null);
    setShopIdInput('');
  }

  function handleSelectProfile(worker: Profile | WorkerSummary) {
    if (!currentShop) {
      setError('Please select a shop first.');
      return;
    }

    if (worker.shopId !== currentShop.id || worker.status !== 'ACTIVE') {
      setError('Selected worker is not authorized for this shop.');
      return;
    }

    router.push({
      pathname: '/pin',
      params: {
        profileId: worker.id,
        shopId: currentShop.id,
      },
    });
  }

  const activeWorkers = currentShop
    ? (workers.length > 0 ? workers : getWorkersByShop(currentShop.id)).filter(
        (worker) => worker.status === 'ACTIVE'
      )
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <View style={styles.header}>
            <Image
              source={require('@/assets/logo_full.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>
              {currentShop ? 'Select your profile' : 'Worker Login'}
            </Text>
          </View>

          {!currentShop ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Shop Verification</Text>
              <Text style={styles.sectionHint}>
                Enter your unique Shop ID (e.g. LC-XXXXXX) to view available workers.
              </Text>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.shopInput}
                  placeholder="e.g. LC-XXXXXX"
                  placeholderTextColor="#B0B0AA"
                  value={shopIdInput}
                  editable={!loading}
                  onChangeText={(val) => {
                    setError(null);
                    setShopIdInput(val.toUpperCase());
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Find Shop"
                disabled={loading}
                onPress={handleValidateShop}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || loading) && styles.pressed,
                  loading && { opacity: 0.7 },
                ]}>
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Verifying Shop...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.shopBanner}>
                <View style={styles.shopInfo}>
                  <Text style={styles.shopName}>{currentShop.name}</Text>
                  <Text style={styles.shopId}>ID: {currentShop.id}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change Shop"
                  onPress={handleResetShop}
                  style={({ pressed }) => [styles.changeShopButton, pressed && styles.pressed]}>
                  <Text style={styles.changeShopText}>Change</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionLabel}>Workers</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {activeWorkers.length === 0 ? (
                <Text style={styles.sectionHint}>No active workers registered for this shop.</Text>
              ) : (
                activeWorkers.map((worker) => (
                  <ProfileCard key={worker.id} profile={worker} onPress={handleSelectProfile} />
                ))
              )}
            </View>
          )}
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
    flexGrow: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  headerLogo: {
    width: 140,
    height: 48,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B6B6B',
  },
  section: {
    marginBottom: 28,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  sectionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B6B6B',
    marginBottom: 4,
  },
  inputContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  shopInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: BrandColors.navy,
    borderWidth: 1,
    borderColor: '#E5E5E0',
    letterSpacing: 1,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  shopBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5E0',
    marginBottom: 12,
  },
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: 17,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  shopId: {
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
  },
  changeShopButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0F0EE',
  },
  changeShopText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    gap: 14,
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.86,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardCopy: {
    flex: 1,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  cardRole: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B6B6B',
  },
  pressed: {
    opacity: 0.86,
  },
});

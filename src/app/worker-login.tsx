import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
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

function ProfileCard({
  profile,
  onPress,
}: {
  profile: Profile;
  onPress: (profile: Profile) => void;
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
  const { items } = useUserStore();

  const selectable = items.filter((user) => user.status === 'ACTIVE');
  const workers = selectable.filter((profile) => profile.role === 'WORKER');

  function handleSelectProfile(profile: Profile) {
    router.push({
      pathname: '/pin',
      params: { profileId: profile.id },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
            source={require('@/assets/images/logo-compact.png')} 
            style={styles.headerLogo} 
            resizeMode="contain" 
          />
          <Text style={styles.subtitle}>Select your profile</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Workers</Text>
          {workers.length === 0 ? (
            <Text style={styles.sectionHint}>No active workers yet.</Text>
          ) : (
            workers.map((worker) => (
              <ProfileCard key={worker.id} profile={worker} onPress={handleSelectProfile} />
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
    backgroundColor: BrandColors.background,
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

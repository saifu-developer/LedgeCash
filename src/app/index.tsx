import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';
import { useUserStore } from '@/store/users';

export default function OpeningScreen() {
  const router = useRouter();
  const { items } = useUserStore();
  const owner = items.find((user) => user.role === 'OWNER' && user.status === 'ACTIVE');
  
  const [error, setError] = useState('');

  function handleCreateOwner() {
    if (owner) {
      setError('Owner already exists. Please login as owner or continue with the existing account.');
      return;
    }
    router.push('/owner-setup');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/logo-full.png')} 
            style={styles.logo} 
            resizeMode="contain" 
          />
          <Text style={styles.subtitle}>Simple money management</Text>
        </View>

        <View style={styles.actions}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          
          <Pressable 
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} 
            onPress={handleCreateOwner}>
            <Text style={styles.primaryButtonText}>Create Owner</Text>
          </Pressable>

          {owner && (
            <Pressable 
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} 
              onPress={() => router.push({ pathname: '/pin', params: { profileId: owner.id } })}>
              <Text style={styles.secondaryButtonText}>Login as Owner</Text>
            </Pressable>
          )}

          <Pressable 
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} 
            onPress={() => router.push('/worker-login')}>
            <Text style={styles.secondaryButtonText}>Login as Worker</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  logo: {
    width: 220,
    height: 60,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B6B6B',
  },
  actions: {
    width: '100%',
    gap: 16,
    marginTop: 'auto',
  },
  primaryButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  secondaryButtonText: {
    color: BrandColors.navy,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.86,
  },
});

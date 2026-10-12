import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ComingSoonScreenProps = {
  title: string;
  description: string;
  backHref: '/owner' | '/worker';
};

export function ComingSoonScreen({ title, description, backHref }: ComingSoonScreenProps) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace(backHref)}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.body}>
          <Text style={styles.kicker}>CashManager</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: '#6B6B6B',
  },
  pressed: {
    opacity: 0.72,
  },
});

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { initSyncEngine, triggerSync } from '@/lib/sync-service';
import { loadPersistedAudit, useAuditStore } from '@/store/audit';
import { loadPersistedShops, useShopStore } from '@/store/shops';
import { loadPersistedTransactions, useTransactionStore } from '@/store/transactions';
import { loadPersistedUsers, useUserStore } from '@/store/users';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { hydrated: shopsHydrated } = useShopStore();
  const { hydrated: usersHydrated } = useUserStore();
  const { hydrated: txHydrated } = useTransactionStore();
  const { hydrated: auditHydrated } = useAuditStore();

  const isHydrated = shopsHydrated && usersHydrated && txHydrated && auditHydrated;

  useEffect(() => {
    const cleanupSync = initSyncEngine();
    void (async () => {
      await loadPersistedShops();
      await loadPersistedUsers();
      await loadPersistedTransactions();
      await loadPersistedAudit();
      triggerSync(1200);
    })();
    return () => {
      cleanupSync();
    };
  }, []);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync();
    }
  }, [isHydrated]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {isHydrated ? (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            freezeOnBlur: false,
          }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: BrandColors.background }} />
      )}
    </ThemeProvider>
  );
}

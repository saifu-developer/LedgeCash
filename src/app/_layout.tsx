import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { loadPersistedUsers, useUserStore } from '@/store/users';
import { loadPersistedTransactions, useTransactionStore } from '@/store/transactions';
import { loadPersistedAudit, useAuditStore } from '@/store/audit';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { hydrated: usersHydrated } = useUserStore();
  const { hydrated: txHydrated } = useTransactionStore();
  const { hydrated: auditHydrated } = useAuditStore();
  
  const isHydrated = usersHydrated && txHydrated && auditHydrated;

  useEffect(() => {
    void loadPersistedUsers();
    void loadPersistedTransactions();
    void loadPersistedAudit();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {isHydrated ? (
        <>
          <AnimatedSplashOverlay />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              freezeOnBlur: false,
            }}
          />
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#F7F7F5' }} />
      )}
    </ThemeProvider>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { setAuthToken } from '@/lib/api-client';
import { getDb } from '@/lib/db';
import { setActiveShopId, setCurrentProfile } from '@/session/current-profile';
import { resetAuditStore } from '@/store/audit';
import { resetShopStore } from '@/store/shops';
import { resetTransactionStore } from '@/store/transactions';
import { resetUserStore } from '@/store/users';

/**
 * Cleanly wipes all local application state:
 * 1. Resets active in-memory session (profile & active shop).
 * 2. Clears authentication token.
 * 3. Deletes all rows from SQLite tables (transactions, audit, shops, sync_meta).
 * 4. Removes user storage from AsyncStorage and resets all reactive stores.
 */
export async function resetAllAppData(): Promise<void> {
  // 1. Clear session & auth
  setCurrentProfile(null);
  setActiveShopId(null);
  await setAuthToken(null).catch(() => {});

  // 2. Wipe SQLite database tables
  try {
    const db = await getDb();
    await db.execAsync(`
      DELETE FROM transactions;
      DELETE FROM audit;
      DELETE FROM shops;
      DELETE FROM sync_meta;
    `);
  } catch (error) {
    console.warn('Error wiping SQLite tables during app reset:', error);
  }

  // 3. Reset in-memory stores & AsyncStorage
  await resetUserStore();
  await resetShopStore().catch(() => {});
  await resetTransactionStore().catch(() => {});
  await resetAuditStore().catch(() => {});

  // 4. Clear any lingering AsyncStorage keys
  try {
    await AsyncStorage.removeItem('cashmanager_users');
    await AsyncStorage.removeItem('cashmanager_auth_token');
  } catch {
    // Non-fatal
  }
}

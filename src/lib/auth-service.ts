import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  apiClient,
  getAuthToken,
  setAuthToken,
  ApiError,
  onUnauthorized,
  loginOwnerApi,
  switchShopApi,
  createShopApi,
  getOwnedShopsApi,
} from '@/lib/api-client';
import { setCurrentProfile, setActiveShopId, getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { createShop, upsertShops, getShopById, getShopsByOwner } from '@/store/shops';
import {
  getLoginProfile,
  setupOwner,
  verifyPin,
  addWorker,
  upsertWorkerProfiles,
  cacheAuthenticatedUser,
  setWorkerStatus,
  changeWorkerPin,
  isValidPin,
  getUsers,
} from '@/store/users';
import type { Profile, UserRole, UserStatus } from '@/types/profile';
import type { Shop } from '@/types/shop';
import { triggerSync } from '@/lib/sync-service';
import {
  parseJwtPayload,
  getShopIdFromJwt,
  assertJwtShopConsistency,
  verifyJwtShopConsistency,
} from '@/lib/jwt-utils';

export {
  parseJwtPayload,
  getShopIdFromJwt,
  assertJwtShopConsistency,
  verifyJwtShopConsistency,
};



export const STORAGE_KEY_LAST_WORKER_SHOP = 'ledgecash_last_worker_shop';

/**
 * Retrieves the last successfully used worker Shop ID from local storage.
 */
export async function getLastWorkerShopId(): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_LAST_WORKER_SHOP);
    return val ? val.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the last successfully authenticated worker Shop ID.
 * Stores ONLY the shop code; never stores PIN, JWT, or credentials.
 */
export async function setLastWorkerShopId(shopId: string): Promise<void> {
  try {
    if (!shopId) return;
    const sanitized = shopId.trim().toUpperCase();
    await AsyncStorage.setItem(STORAGE_KEY_LAST_WORKER_SHOP, sanitized);
  } catch (err) {
    console.warn('Failed to save last worker shop ID:', err);
  }
}

/**
 * Explicitly clears the remembered worker Shop ID (e.g. app reset or forget device).
 */
export async function clearLastWorkerShopId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_LAST_WORKER_SHOP);
  } catch (err) {
    console.warn('Failed to clear last worker shop ID:', err);
  }
}

export type AuthResponse = {
  token: string;
  tokenType: string;
  userId: string;
  name: string;
  phone: string;
  shopId: string;
  shopName: string;
  role: UserRole;
};

export type WorkerSummary = {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  shopId: string;
};

export type ShopDiscoveryResponse = {
  shopId: string;
  shopName: string;
  ownerId: string;
  workers: WorkerSummary[];
};

// Wire 401 handler to clear token & session
onUnauthorized(() => {
  setAuthToken(null).catch(() => {});
  setCurrentProfile(null);
  setActiveShopId(null);
});

/**
 * Cleanly logs out the current authenticated user:
 * Clears JWT from SecureStore, active session, and active shop.
 * Preserves secure offline PINs so user can authenticate again.
 * Preserves the remembered worker Shop ID on device.
 */
export async function logout(): Promise<void> {
  await setAuthToken(null).catch(() => {});
  setCurrentProfile(null);
  setActiveShopId(null);
}

/**
 * Queries the cloud backend to verify shop existence and retrieve active worker profiles.
 * Caches the discovered shop and worker profiles locally for subsequent PIN entry.
 */
export async function fetchShopAndWorkersFromCloud(
  shopCode: string
): Promise<ShopDiscoveryResponse> {
  const normalized = shopCode.trim().toUpperCase();
  if (!normalized) {
    throw new Error('Please enter a Shop ID.');
  }

  try {
    const res = await apiClient<ShopDiscoveryResponse>(
      `/api/v1/auth/shop/${encodeURIComponent(normalized)}/workers`,
      { method: 'GET' }
    );

    // Cache the discovered shop into local SQLite and shop store
    await createShop(res.ownerId || 'cloud-owner', res.shopName, res.shopId);

    // Cache discovered worker profiles into local user store
    if (res.workers) {
      await upsertWorkerProfiles(res.workers, res.shopId);
    }

    return res;
  } catch (err: any) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        throw new Error(`Shop not found with code: ${normalized}`);
      }
      if (err.status === 0 || err.status === 408) {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw new Error(err.message || 'Failed to find shop. Please try again.');
    }
    throw new Error(err?.message || 'Unable to connect to server. Please check your internet connection.');
  }
}

/**
 * Registers an owner both on the Spring Boot backend and locally
 */
export async function registerOwnerWithCloud(params: {
  name: string;
  phone: string;
  pin: string;
  shopName: string;
}): Promise<{ profile: Profile; shopId: string; isCloudRegistered: boolean }> {
  try {
    const res = await apiClient<AuthResponse>('/api/v1/auth/register-owner', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        phone: params.phone,
        pin: params.pin,
        shopName: params.shopName,
      }),
    });

    // Save JWT token
    await setAuthToken(res.token);

    // Persist locally in user & shop stores with cloud-authoritative identifiers
    const localOwner = await setupOwner({
      id: res.userId,
      name: res.name,
      pin: params.pin,
      phone: res.phone,
      shopId: res.shopId,
    });

    // Create local shop matching cloud shop code
    await createShop(localOwner.id, res.shopName, res.shopId);

    // Establish active session
    setCurrentProfile(localOwner);
    try {
      setActiveShopId(res.shopId);
    } catch {
      // Handled upon login
    }

    triggerSync(500);

    return {
      profile: localOwner,
      shopId: res.shopId,
      isCloudRegistered: true,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Authenticates user (Owner or Worker) with cloud fallback to local
 */
export async function loginWithCloudOrLocal(params: {
  profileId: string;
  pin: string;
  phone?: string;
  shopId?: string;
}): Promise<{ profile: Profile; isCloudAuthenticated: boolean }> {
  const localProfile = getLoginProfile(params.profileId);
  const targetShopId = params.shopId || localProfile?.shopId || getActiveShopId();

  const isLegacyLocalId = Boolean(params.profileId?.startsWith('worker-'));

  // 1. Attempt cloud authentication if targetShopId is available
  if (targetShopId) {
    try {
      const payload: { shopId: string; pin: string; userId?: string; phone?: string } = {
        shopId: targetShopId,
        pin: params.pin,
      };

      if (params.profileId && !isLegacyLocalId) {
        payload.userId = params.profileId;
      }

      const candidatePhone = params.phone || localProfile?.phone;
      if (candidatePhone) {
        payload.phone = candidatePhone;
      }

      // If we have an identifier (userId or phone), attempt cloud login
      if (payload.userId || payload.phone) {
        const res = await apiClient<AuthResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Save JWT token using existing authentication mechanism
        await setAuthToken(res.token);

        // Persist cloud-authoritative shop record locally
        await createShop(res.userId, res.shopName, res.shopId);

        // Cache authenticated user with PIN locally for offline fallback
        await cacheAuthenticatedUser({
          id: res.userId,
          name: res.name,
          role: res.role,
          status: 'ACTIVE',
          pin: params.pin,
          shopId: res.shopId,
          ...(res.phone ? { phone: res.phone } : {}),
          ...(params.profileId !== res.userId ? { legacyProfileId: params.profileId } : {}),
        });

        const authenticatedProfile: Profile = {
          id: res.userId,
          name: res.name,
          role: res.role,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          shopId: res.shopId,
          ...(res.phone ? { phone: res.phone } : {}),
        };

        setCurrentProfile(authenticatedProfile);
        setActiveShopId(res.shopId);
        triggerSync(500);

        if (authenticatedProfile.role === 'WORKER' && res.shopId) {
          await setLastWorkerShopId(res.shopId);
        }

        return { profile: authenticatedProfile, isCloudAuthenticated: true };
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          // Immediately update local profile to INACTIVE to prevent any offline bypass
          if (localProfile) {
            await setWorkerStatus(params.profileId, 'INACTIVE').catch(() => {});
          }
          throw new Error('Account is inactive. Please contact your shop owner.');
        }
        if (err.status === 404) {
          throw new Error('Shop not found. Please verify the Shop ID.');
        }
        if (err.status === 400) {
          // Only permit local fallback if the worker was created offline locally (worker-* prefix)
          // and has not yet synced to the cloud. For registered cloud workers, cloud 400 is authoritative.
          if (isLegacyLocalId && localProfile && verifyPin(params.profileId, params.pin, targetShopId || undefined)) {
            setCurrentProfile(localProfile);
            if (targetShopId) {
              try {
                setActiveShopId(targetShopId);
              } catch {}
            }
            if (localProfile.role === 'WORKER' && targetShopId) {
              await setLastWorkerShopId(targetShopId);
            }
            return { profile: localProfile, isCloudAuthenticated: false };
          }
          throw new Error('Incorrect PIN. Please try again.');
        }
        throw new Error(err.message || 'Authentication failed. Please try again.');
      }

      // If backend network error or timeout occurred (status 0 or 408)
      // Check if local verification can succeed (e.g. offline mode after initial login)
      if (localProfile) {
        const isLocalValid = verifyPin(params.profileId, params.pin, targetShopId || undefined);
        if (isLocalValid) {
          setCurrentProfile(localProfile);
          if (targetShopId) {
            try {
              setActiveShopId(targetShopId);
            } catch {}
          }
          if (localProfile.role === 'WORKER' && targetShopId) {
            await setLastWorkerShopId(targetShopId);
          }
          return { profile: localProfile, isCloudAuthenticated: false };
        }
      }

      // If local offline fallback was not possible (fresh device), surface clear connection error
      if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw err;
    }
  }

  // Fallback to local verification if no targetShopId
  if (!localProfile) {
    throw new Error('Profile not found.');
  }

  const isValid = verifyPin(params.profileId, params.pin, targetShopId || undefined);
  if (!isValid) {
    throw new Error('Incorrect PIN. Please try again.');
  }

  setCurrentProfile(localProfile);
  if (targetShopId) {
    try {
      setActiveShopId(targetShopId);
    } catch {}
  }
  if (localProfile.role === 'WORKER' && (targetShopId || localProfile.shopId)) {
    await setLastWorkerShopId(targetShopId || localProfile.shopId!);
  }

  return { profile: localProfile, isCloudAuthenticated: false };
}

/**
 * Creates a worker on the backend (if online) and locally
 */
export async function createWorkerWithCloud(params: {
  name: string;
  phone: string;
  pin: string;
}): Promise<Profile> {
  const current = getCurrentProfile();
  const shopId = getActiveShopId();

  if (!current || current.role !== 'OWNER' || !shopId) {
    throw new Error('Only the shop owner can create workers.');
  }

  try {
    const res = await apiClient<AuthResponse>('/api/v1/auth/create-worker', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        phone: params.phone,
        pin: params.pin,
      }),
    });

    const worker = await addWorker({
      id: res.userId,
      name: res.name,
      phone: res.phone || params.phone,
      pin: params.pin,
      shopId: res.shopId,
    });

    return worker;
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      console.warn('Backend offline; saving worker locally');
      return addWorker({
        name: params.name,
        phone: params.phone,
        pin: params.pin,
        shopId,
      });
    }
    throw err;
  }
}

/**
 * Updates worker active/inactive status in the cloud backend (if online) and locally.
 * Returns the updated Profile and a flag indicating whether the cloud was updated.
 */
export async function updateWorkerStatusWithCloud(
  workerId: string,
  status: UserStatus
): Promise<{ profile: Profile; isCloudUpdated: boolean }> {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only the shop owner can manage workers.');
  }

  const isLocalOnly = workerId.startsWith('worker-');

  if (!isLocalOnly) {
    try {
      await apiClient<{ id: string; status: UserStatus }>(
        `/api/v1/auth/workers/${encodeURIComponent(workerId)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      );

      // Cloud succeeded: update local profile
      const updated = await setWorkerStatus(workerId, status);
      return { profile: updated, isCloudUpdated: true };
    } catch (err: any) {
      if (err instanceof ApiError) {
        // If server actively rejected the request (403 forbidden, 404 not found, 400 bad request)
        if (err.status === 403 || err.status === 404 || err.status === 400) {
          throw new Error(err.message || 'Server rejected status update.');
        }

        // If backend network is unreachable (status 0 or 408)
        if (err.status === 0 || err.status === 408) {
          console.warn('Backend unreachable; updating worker status locally only');
          const updated = await setWorkerStatus(workerId, status);
          return { profile: updated, isCloudUpdated: false };
        }
      }

      // Other fetch/network failure
      console.warn('Network error; updating worker status locally only', err);
      const updated = await setWorkerStatus(workerId, status);
      return { profile: updated, isCloudUpdated: false };
    }
  }

  // Local-only worker (not yet registered on cloud)
  const updated = await setWorkerStatus(workerId, status);
  return { profile: updated, isCloudUpdated: false };
}

/**
 * Updates worker PIN in the cloud backend (if online) and in SecureStore locally.
 * Returns the updated Profile and a flag indicating whether the cloud was updated.
 */
export async function updateWorkerPinWithCloud(
  workerId: string,
  newPin: string
): Promise<{ profile: Profile; isCloudUpdated: boolean }> {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only the shop owner can manage workers.');
  }

  if (!isValidPin(newPin)) {
    throw new Error('New PIN must be exactly 4 digits.');
  }

  const isLocalOnly = workerId.startsWith('worker-');

  if (!isLocalOnly) {
    try {
      await apiClient<{ id: string }>(
        `/api/v1/auth/workers/${encodeURIComponent(workerId)}/pin`,
        {
          method: 'PATCH',
          body: JSON.stringify({ pin: newPin }),
        }
      );

      // Cloud succeeded: update local SecureStore PIN
      const updated = await changeWorkerPin(workerId, newPin);
      return { profile: updated, isCloudUpdated: true };
    } catch (err: any) {
      if (err instanceof ApiError) {
        // If server actively rejected the request (403 forbidden, 404 not found, 400 bad request)
        if (err.status === 403 || err.status === 404 || err.status === 400) {
          throw new Error(err.message || 'Server rejected PIN update.');
        }

        // If backend network is unreachable (status 0 or 408)
        if (err.status === 0 || err.status === 408) {
          console.warn('Backend unreachable; updating worker PIN locally only');
          const updated = await changeWorkerPin(workerId, newPin);
          return { profile: updated, isCloudUpdated: false };
        }
      }

      // Other fetch/network failure
      console.warn('Network error; updating worker PIN locally only', err);
      const updated = await changeWorkerPin(workerId, newPin);
      return { profile: updated, isCloudUpdated: false };
    }
  }

  // Local-only worker
  const updated = await changeWorkerPin(workerId, newPin);
  return { profile: updated, isCloudUpdated: false };
}

/* ====================================================================
   MULTI-SHOP CLOUD INTEGRATION (PHASE 3)
   ==================================================================== */

export interface OwnerCloudLoginParams {
  phone: string;
  pin: string;
}

export interface OwnerCloudLoginResult {
  profile: Profile;
  activeShopId: string;
  shops: Shop[];
  token: string | null;
  isCloudAuthenticated: boolean;
}

/**
 * PHASE 3.2 — OWNER LOGIN
 * Authenticates an owner with the backend multi-shop owner-login endpoint.
 *
 * Invariant:
 * 1. Persists JWT securely in SecureStore via setAuthToken.
 * 2. Caches authenticated user credentials in user store (PIN in SecureStore only).
 * 3. Hydrates local SQLite shops store with authoritative server-returned owned shops.
 * 4. Sets initial active shop to authoritative activeShopId selected by server.
 * 5. Falls back to local offline PIN authentication if server is unreachable.
 */
export async function loginOwnerWithCloud(
  params: OwnerCloudLoginParams
): Promise<OwnerCloudLoginResult> {
  const trimmedPhone = params.phone?.trim();
  if (!trimmedPhone) {
    throw new Error('Phone number is required.');
  }
  if (!params.pin || !isValidPin(params.pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }

  try {
    const res = await loginOwnerApi({
      phone: trimmedPhone,
      pin: params.pin,
    });

    if (!res || !res.token || !res.userId || !res.activeShopId) {
      throw new Error('Invalid response received from authentication server.');
    }

    // 1. Persist the JWT using the existing SecureStore mechanism
    await setAuthToken(res.token);

    // 2. Map cloud shops authoritative snapshot
    const cloudShops: Shop[] = (res.shops || []).map((s) => ({
      id: s.id,
      name: s.name,
      ownerId: s.ownerId || res.userId,
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt).toISOString(),
    }));

    // Ensure the server-selected active shop is present in the local shop list
    if (res.activeShopId && !cloudShops.some((s) => s.id === res.activeShopId)) {
      cloudShops.push({
        id: res.activeShopId,
        name: res.activeShopName || 'My Shop',
        ownerId: res.userId,
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Hydrate local shop store with the authoritative cloud-owned shop list
    await upsertShops(cloudShops);

    // 4. Cache/update the owner profile in users store (stores PIN in SecureStore, never in AsyncStorage)
    await cacheAuthenticatedUser({
      id: res.userId,
      name: res.name,
      role: 'OWNER',
      status: 'ACTIVE',
      pin: params.pin,
      shopId: res.activeShopId,
      phone: res.phone || trimmedPhone,
    });

    // 5. Establish current profile and active shop
    const ownerProfile: Profile = {
      id: res.userId,
      name: res.name,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      shopId: res.activeShopId,
      phone: res.phone || trimmedPhone,
    };
    setCurrentProfile(ownerProfile);
    setActiveShopId(res.activeShopId);

    // 6. Verify consistency between stored JWT and activeShopId
    assertJwtShopConsistency(res.token, res.activeShopId);

    return {
      profile: ownerProfile,
      activeShopId: res.activeShopId,
      shops: cloudShops,
      token: res.token,
      isCloudAuthenticated: true,
    };
  } catch (err: any) {
    if (err instanceof ApiError) {
      if (err.status === 400) {
        throw new Error('Incorrect phone number or PIN. Please try again.');
      }
      if (err.status === 404) {
        throw new Error('Owner account not found. Please register first.');
      }
      if (err.status === 0 || err.status === 408) {
        const fallback = await attemptOwnerOfflineLogin(trimmedPhone, params.pin);
        if (fallback) {
          return fallback;
        }
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw new Error(err.message || 'Owner login failed. Please try again.');
    }

    // Fallback if network connection failed without an HTTP status code
    if (
      err?.name === 'TypeError' ||
      err?.message?.includes('network') ||
      err?.message?.includes('fetch')
    ) {
      const fallback = await attemptOwnerOfflineLogin(trimmedPhone, params.pin);
      if (fallback) {
        return fallback;
      }
    }

    throw err;
  }
}

async function attemptOwnerOfflineLogin(
  phone: string,
  pin: string
): Promise<OwnerCloudLoginResult | null> {
  const users = getUsers();
  const normalizedInput = phone.replace(/\D/g, '');
  const localOwner = users.find(
    (u) =>
      u.role === 'OWNER' &&
      u.phone &&
      (u.phone.trim() === phone || u.phone.replace(/\D/g, '') === normalizedInput)
  );

  if (!localOwner) {
    return null;
  }

  const isValid = verifyPin(localOwner.id, pin);
  if (!isValid) {
    throw new Error('Incorrect PIN. Please try again.');
  }

  const ownedShops = getShopsByOwner(localOwner.id);
  const activeShopId = ownedShops.length > 0 ? ownedShops[0].id : localOwner.shopId || '';

  const publicProfile: Profile = {
    id: localOwner.id,
    name: localOwner.name,
    role: 'OWNER',
    status: localOwner.status,
    createdAt: localOwner.createdAt,
    shopId: activeShopId,
    phone: localOwner.phone,
  };

  setCurrentProfile(publicProfile);
  if (activeShopId) {
    try {
      setActiveShopId(activeShopId);
    } catch {}
  }

  return {
    profile: publicProfile,
    activeShopId,
    shops: ownedShops,
    token: null,
    isCloudAuthenticated: false,
  };
}

export interface SwitchShopResult {
  success: boolean;
  shopId: string;
  token: string;
  profile: Profile;
}

/**
 * PHASE 3.4 — SWITCH SHOP
 * Switches the authenticated OWNER to another owned shop via the backend.
 *
 * CRITICAL SECURITY RULE:
 * Safe execution order:
 * 1. Request server switch: POST /api/v1/auth/switch-shop
 * 2. Receive new shop-scoped JWT
 * 3. Validate response matches requested target shop
 * 4. Persist new JWT through SecureStore
 * 5. Update activeShopId ONLY AFTER new JWT is securely stored
 *
 * The frontend NEVER enters activeShopId = Shop B while JWT.shopId = Shop A.
 */
export async function switchShopWithCloud(shopId: string): Promise<SwitchShopResult> {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can switch shops.');
  }

  const targetShopId = shopId?.trim().toUpperCase();
  if (!targetShopId) {
    throw new Error('Target shop ID is required.');
  }

  // 1. Verify that target shop is owned locally by this owner if known
  const ownedShops = getShopsByOwner(current.id);
  const targetShop = ownedShops.find((s) => s.id === targetShopId) || getShopById(targetShopId);
  if (targetShop && targetShop.ownerId !== current.id) {
    throw new Error(`Shop "${targetShopId}" is not owned by the current owner.`);
  }

  // 2. Send: POST /api/v1/auth/switch-shop
  const res = await switchShopApi({ shopId: targetShopId });

  // 3. Receive NEW JWT and validate response
  if (!res || !res.token) {
    throw new Error('Server failed to return a new authentication token.');
  }

  if (res.shopId !== targetShopId) {
    throw new Error(
      `Server returned token for unexpected shop "${res.shopId}" instead of requested "${targetShopId}".`
    );
  }

  const tokenShopId = getShopIdFromJwt(res.token);
  if (tokenShopId && tokenShopId !== targetShopId) {
    throw new Error(
      `Token claims shopId "${tokenShopId}" does not match requested target "${targetShopId}".`
    );
  }

  // 4. Ensure shop is present in local store so setActiveShopId authorization check succeeds
  if (!targetShop) {
    await upsertShops([
      {
        id: targetShopId,
        name: res.shopName || targetShopId,
        ownerId: current.id,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  // 5. Persist the new JWT through SecureStore
  // CRITICAL SECURITY RULE: Persist token FIRST before changing activeShopId!
  await setAuthToken(res.token);

  // 6. Update local active shop only AFTER the new JWT is successfully stored
  setActiveShopId(targetShopId);

  // 7. Update current profile session
  const updatedProfile: Profile = {
    ...current,
    shopId: targetShopId,
  };
  setCurrentProfile(updatedProfile);

  // Trigger sync for the new active shop
  triggerSync(300);

  return {
    success: true,
    shopId: targetShopId,
    token: res.token,
    profile: updatedProfile,
  };
}

/**
 * PHASE 3.5 — CREATE SHOP
 * Creates an additional shop for the authenticated owner on the backend.
 * Persists the created shop into the local shop store without changing activeShopId.
 * Does NOT send ownerId (the backend extracts owner identity from the JWT).
 */
export async function createShopWithCloud(name: string): Promise<Shop> {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can create a shop.');
  }

  const trimmedName = name?.trim();
  if (!trimmedName) {
    throw new Error('Shop name is required.');
  }

  // 1. Call POST /api/v1/shops (Do NOT send ownerId)
  const res = await createShopApi({ name: trimmedName });

  if (!res || !res.id || !res.name) {
    throw new Error('Invalid response received from server when creating shop.');
  }

  // 2. Receive authoritative Shop object from backend
  const createdShop: Shop = {
    id: res.id,
    name: res.name,
    ownerId: res.ownerId || current.id,
    createdAt: typeof res.createdAt === 'string' ? res.createdAt : new Date(res.createdAt).toISOString(),
  };

  // 3. Persist/upsert into local shop store
  await upsertShops([createdShop]);

  // 4. Do NOT automatically change activeShopId (user remains in current shop)
  return createdShop;
}

/**
 * PHASE 3.6 — GET OWNED SHOPS
 * Retrieves all shops owned by the authenticated owner from the backend.
 * Hydrates local shop store with authoritative cloud shops.
 */
export async function fetchOwnedShopsWithCloud(): Promise<Shop[]> {
  const current = getCurrentProfile();
  if (!current || current.role !== 'OWNER') {
    throw new Error('Only an authenticated shop owner can fetch owned shops.');
  }

  // 1. Call GET /api/v1/shops
  const res = await getOwnedShopsApi();

  // 2. Map and filter to ensure only owned shops are processed
  const cloudShops: Shop[] = (res || [])
    .filter((s) => !s.ownerId || s.ownerId === current.id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      ownerId: current.id,
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt).toISOString(),
    }));

  // 3. Update local shop store
  await upsertShops(cloudShops);

  // 4. Recovery: If current active shop is no longer in owned shops, recover to first owned shop
  const currentActive = getActiveShopId();
  if (currentActive) {
    const stillOwned = cloudShops.some((s) => s.id === currentActive);
    if (!stillOwned && cloudShops.length > 0) {
      setActiveShopId(cloudShops[0].id);
    }
  }

  return cloudShops;
}

export interface SessionRestoreResult {
  restored: boolean;
  profile: Profile | null;
  activeShopId: string | null;
}

/**
 * PHASE 4 — SESSION RESTORATION
 * Restores an existing authenticated session from SecureStore JWT on app launch.
 * Enforces the strict invariant:
 *   activeShopId === JWT.shopId
 * Never allows the app to start in an inconsistent state:
 *   JWT = Shop A, activeShopId = Shop B
 */
export async function restoreSession(): Promise<SessionRestoreResult> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return { restored: false, profile: null, activeShopId: null };
    }

    const payload = parseJwtPayload(token);
    if (!payload || !payload.sub || !payload.shopId || !payload.role) {
      // Corrupt or unrecognized token -> clear session
      await logout();
      return { restored: false, profile: null, activeShopId: null };
    }

    const userId = payload.sub as string;
    const jwtShopId = (payload.shopId as string).trim().toUpperCase();
    const role: UserRole = payload.role === 'OWNER' ? 'OWNER' : 'WORKER';

    if (role === 'OWNER') {
      const users = getUsers();
      const localOwner = users.find((u) => u.id === userId && u.role === 'OWNER');

      // Ensure the shop is present in SQLite shops store
      const shop = getShopById(jwtShopId);
      if (!shop) {
        await upsertShops([
          {
            id: jwtShopId,
            name: payload.shopName || jwtShopId,
            ownerId: userId,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      const ownerProfile: Profile = {
        id: userId,
        name: localOwner?.name || payload.name || 'Owner',
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: localOwner?.createdAt || new Date().toISOString(),
        shopId: jwtShopId,
        phone: localOwner?.phone || payload.phone,
      };

      setCurrentProfile(ownerProfile);
      setActiveShopId(jwtShopId);

      // Verify invariant: JWT shopId must match activeShopId exactly
      assertJwtShopConsistency(token, jwtShopId);

      // Asynchronously refresh owned shops snapshot in the background if online
      fetchOwnedShopsWithCloud().catch(() => {});

      return {
        restored: true,
        profile: ownerProfile,
        activeShopId: jwtShopId,
      };
    } else {
      // Worker session restoration
      const users = getUsers();
      const localWorker = users.find((u) => u.id === userId && u.role === 'WORKER');

      const workerProfile: Profile = {
        id: userId,
        name: localWorker?.name || payload.name || 'Worker',
        role: 'WORKER',
        status: 'ACTIVE',
        createdAt: localWorker?.createdAt || new Date().toISOString(),
        shopId: jwtShopId,
        phone: localWorker?.phone || payload.phone,
      };

      setCurrentProfile(workerProfile);
      setActiveShopId(jwtShopId);

      return {
        restored: true,
        profile: workerProfile,
        activeShopId: jwtShopId,
      };
    }
  } catch (err) {
    console.warn('Session restoration encountered error:', err);
    await logout().catch(() => {});
    return { restored: false, profile: null, activeShopId: null };
  }
}




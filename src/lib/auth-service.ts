import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, setAuthToken, ApiError, onUnauthorized } from '@/lib/api-client';
import { setCurrentProfile, setActiveShopId, getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { createShop } from '@/store/shops';
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
} from '@/store/users';
import type { Profile, UserRole, UserStatus } from '@/types/profile';
import { triggerSync } from '@/lib/sync-service';

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


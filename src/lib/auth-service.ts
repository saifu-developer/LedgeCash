import { apiClient, setAuthToken, ApiError, onUnauthorized } from '@/lib/api-client';
import { setCurrentProfile, setActiveShopId, getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { createShop } from '@/store/shops';
import { getLoginProfile, setupOwner, verifyPin, addWorker, upsertWorkerProfiles, cacheAuthenticatedUser } from '@/store/users';
import type { Profile, UserRole, UserStatus } from '@/types/profile';
import { triggerSync } from '@/lib/sync-service';

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
});

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
    if (res.workers && res.workers.length > 0) {
      await upsertWorkerProfiles(res.workers);
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

  // 1. Attempt cloud authentication if targetShopId is available
  if (targetShopId) {
    try {
      const payload: { shopId: string; pin: string; userId?: string; phone?: string } = {
        shopId: targetShopId,
        pin: params.pin,
      };
      if (params.profileId) {
        payload.userId = params.profileId;
      }
      if (params.phone) {
        payload.phone = params.phone;
      }

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

      return { profile: authenticatedProfile, isCloudAuthenticated: true };
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          throw new Error('Incorrect PIN. Please try again.');
        }
        if (err.status === 403) {
          throw new Error('Account is inactive. Please contact your shop owner.');
        }
        if (err.status === 404) {
          throw new Error('Shop not found. Please verify the Shop ID.');
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
      name: res.name,
      pin: params.pin,
      shopId: res.shopId,
    });

    return worker;
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      console.warn('Backend offline; saving worker locally');
      return addWorker({
        name: params.name,
        pin: params.pin,
        shopId,
      });
    }
    throw err;
  }
}

import { apiClient, setAuthToken, ApiError, onUnauthorized } from '@/lib/api-client';
import { setCurrentProfile, setActiveShopId, getActiveShopId, getCurrentProfile } from '@/session/current-profile';
import { createShop } from '@/store/shops';
import { getLoginProfile, setupOwner, verifyPin, addWorker } from '@/store/users';
import type { Profile, UserRole } from '@/types/profile';
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

// Wire 401 handler to clear token & session
onUnauthorized(() => {
  setAuthToken(null).catch(() => {});
  setCurrentProfile(null);
});

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

    // Persist locally in user & shop stores
    const localOwner = await setupOwner({
      name: res.name,
      pin: params.pin,
    });

    // Create local shop matching cloud shop code
    await createShop(localOwner.id, res.shopName, res.shopId);

    try {
      setActiveShopId(res.shopId);
    } catch {
      // Handled upon login
    }

    return {
      profile: localOwner,
      shopId: res.shopId,
      isCloudRegistered: true,
    };
  } catch (err) {
    // If network error (status 0 or 408), fallback to offline local creation
    if (err instanceof ApiError && err.status === 0) {
      console.warn('Backend offline; performing offline owner onboarding');
      const localOwner = await setupOwner({
        name: params.name,
        pin: params.pin,
      });
      const localShop = await createShop(localOwner.id, params.shopName);
      try {
        setActiveShopId(localShop.id);
      } catch {
        // Handled upon login
      }
      return {
        profile: localOwner,
        shopId: localShop.id,
        isCloudRegistered: false,
      };
    }
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

  // Try cloud login if phone and shopId are available
  if (params.phone && targetShopId) {
    try {
      const res = await apiClient<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          shopId: targetShopId,
          phone: params.phone,
          pin: params.pin,
        }),
      });

      await setAuthToken(res.token);

      if (localProfile) {
        setCurrentProfile(localProfile);
        setActiveShopId(res.shopId);
        triggerSync(500);
        return { profile: localProfile, isCloudAuthenticated: true };
      }

      const remoteProfile: Profile = {
        id: res.userId,
        name: res.name,
        role: res.role,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        shopId: res.shopId,
      };

      setCurrentProfile(remoteProfile);
      setActiveShopId(res.shopId);
      triggerSync(500);
      return { profile: remoteProfile, isCloudAuthenticated: true };
    } catch (err: any) {
      // If error is invalid credentials, rethrow
      if (err instanceof ApiError && err.status === 400) {
        throw err;
      }
      // If network offline (status 0), fallback to local verification
      console.warn('Cloud login unavailable; verifying locally:', err?.message);
    }
  }

  // Local verification fallback
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
    } catch {
      // Ignored if shop not yet loaded
    }
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

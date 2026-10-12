import { useSyncExternalStore } from 'react';

import { getShopById, getShopsByOwner } from '@/store/shops';
import type { Profile, UserRole } from '@/types/profile';
import type { Shop } from '@/types/shop';

type Listener = () => void;

let currentProfile: Profile | null = null;
let activeShopId: string | null = null;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function isSameProfile(left: Profile | null, right: Profile | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.role === right.role &&
    left.name === right.name &&
    left.shopId === right.shopId
  );
}

export function isAuthorizedForShop(
  profile: Profile | null,
  shopId: string
): boolean {
  if (!profile || !shopId) {
    return false;
  }

  if (profile.role === 'WORKER') {
    return profile.shopId === shopId;
  }

  if (profile.role === 'OWNER') {
    const shop = getShopById(shopId);
    return Boolean(shop && shop.ownerId === profile.id);
  }

  return false;
}

export function setActiveShopId(shopId: string | null): void {
  if (shopId === null) {
    if (activeShopId !== null) {
      activeShopId = null;
      emit();
    }
    return;
  }

  if (!currentProfile) {
    throw new Error('Cannot select an active shop without a logged-in profile.');
  }

  if (!isAuthorizedForShop(currentProfile, shopId)) {
    throw new Error(
      `Access denied: Profile "${currentProfile.name}" is not authorized for shop "${shopId}".`
    );
  }

  if (activeShopId !== shopId) {
    activeShopId = shopId;
    emit();
  }
}

export function getActiveShopId(): string | null {
  if (!currentProfile) {
    return null;
  }

  if (currentProfile.role === 'WORKER') {
    return currentProfile.shopId ?? null;
  }

  if (currentProfile.role === 'OWNER') {
    if (activeShopId && isAuthorizedForShop(currentProfile, activeShopId)) {
      return activeShopId;
    }
    // Default to first owned shop if activeShopId is not yet set or no longer valid
    const owned = getShopsByOwner(currentProfile.id);
    if (owned.length > 0) {
      activeShopId = owned[0].id;
      return activeShopId;
    }
    return null;
  }

  return activeShopId;
}

export function getActiveShop(): Shop | null {
  const shopId = getActiveShopId();
  if (!shopId) {
    return null;
  }
  return getShopById(shopId) ?? null;
}

export function setCurrentProfile(profile: Profile | null) {
  if (isSameProfile(currentProfile, profile)) {
    return;
  }

  currentProfile = profile;

  if (!profile) {
    activeShopId = null;
  } else if (profile.role === 'WORKER') {
    activeShopId = profile.shopId ?? null;
  } else if (profile.role === 'OWNER') {
    if (!activeShopId || !isAuthorizedForShop(profile, activeShopId)) {
      const owned = getShopsByOwner(profile.id);
      activeShopId = owned[0]?.id ?? null;
    }
  }

  emit();
}

export function getCurrentProfile(): Profile | null {
  return currentProfile;
}

export function subscribeToSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentProfile(): Profile | null {
  return useSyncExternalStore(
    subscribeToSession,
    getCurrentProfile,
    getCurrentProfile
  );
}

export function useActiveShopId(): string | null {
  return useSyncExternalStore(
    subscribeToSession,
    getActiveShopId,
    getActiveShopId
  );
}

export function useActiveShop(): Shop | null {
  return useSyncExternalStore(subscribeToSession, getActiveShop, getActiveShop);
}

export function getHomeHref(role: UserRole): '/owner' | '/worker' {
  return role === 'OWNER' ? '/owner' : '/worker';
}

export function _resetSessionForTesting(): void {
  currentProfile = null;
  activeShopId = null;
}

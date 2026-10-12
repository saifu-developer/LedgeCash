import { useSyncExternalStore } from 'react';

import type { Profile, UserRole } from '@/types/profile';

type Listener = () => void;

let currentProfile: Profile | null = null;
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

  return left.id === right.id && left.role === right.role && left.name === right.name;
}

export function setCurrentProfile(profile: Profile | null) {
  if (isSameProfile(currentProfile, profile)) {
    return;
  }

  currentProfile = profile;
  emit();
}

export function getCurrentProfile(): Profile | null {
  return currentProfile;
}

export function subscribeToCurrentProfile(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentProfile(): Profile | null {
  return useSyncExternalStore(
    subscribeToCurrentProfile,
    getCurrentProfile,
    getCurrentProfile,
  );
}

export function getHomeHref(role: UserRole): '/owner' | '/worker' {
  return role === 'OWNER' ? '/owner' : '/worker';
}

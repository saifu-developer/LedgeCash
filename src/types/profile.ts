export type UserRole = 'OWNER' | 'WORKER';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Public profile used by session/UI. PIN stays in the user store only.
 * Later, authentication moves to Spring Boot and PINs will not be stored in plaintext.
 */
export type Profile = {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  shopId?: string;
};

export type WorkerProfile = Profile & {
  role: 'WORKER';
  shopId: string;
};

export type OwnerProfile = Profile & {
  role: 'OWNER';
};

export type User = Profile & {
  pin: string;
};

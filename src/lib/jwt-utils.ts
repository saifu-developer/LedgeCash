/**
 * Lightweight, zero-dependency JWT utilities for React Native / Expo and Node.js.
 */

function decodeBase64(input: string): string {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(input);
  }
  const maybeBuffer = (globalThis as any).Buffer;
  if (typeof maybeBuffer !== 'undefined') {
    return maybeBuffer.from(input, 'base64').toString('utf8');
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, idx = 0; (buffer = str.charAt(idx++)); ) {
    const p = chars.indexOf(buffer);
    if (~p) {
      bs = bc % 4 ? bs * 64 + p : p;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }
  }
  return output;
}

export function parseJwtPayload(token: string | null): Record<string, any> | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const decoded = decodeBase64(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getShopIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (payload && typeof payload.shopId === 'string' && payload.shopId.trim()) {
    return payload.shopId.trim();
  }
  return null;
}

export function getUserIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (payload && typeof payload.sub === 'string' && payload.sub.trim()) {
    return payload.sub.trim();
  }
  return null;
}

export function getRoleFromJwt(token: string | null): string | null {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (payload && typeof payload.role === 'string' && payload.role.trim()) {
    return payload.role.trim();
  }
  return null;
}

export interface JwtConsistencyCheck {
  valid: boolean;
  jwtShopId: string | null;
  activeShopId: string | null;
  error?: string;
}

export class SessionInconsistencyError extends Error {
  jwtShopId: string | null;
  activeShopId: string | null;

  constructor(message: string, jwtShopId: string | null, activeShopId: string | null) {
    super(message);
    this.name = 'SessionInconsistencyError';
    this.jwtShopId = jwtShopId;
    this.activeShopId = activeShopId;
  }
}

export function verifyJwtShopConsistency(
  token: string | null,
  activeShopId: string | null
): JwtConsistencyCheck {
  if (!token) {
    // Offline mode or unauthenticated session
    return {
      valid: true,
      jwtShopId: null,
      activeShopId,
    };
  }

  const jwtShopId = getShopIdFromJwt(token);
  if (!jwtShopId) {
    return {
      valid: false,
      jwtShopId: null,
      activeShopId,
      error: 'JWT does not contain a shopId claim.',
    };
  }

  if (activeShopId && jwtShopId !== activeShopId) {
    return {
      valid: false,
      jwtShopId,
      activeShopId,
      error: `Session inconsistency detected: JWT shopId "${jwtShopId}" does not match activeShopId "${activeShopId}".`,
    };
  }

  return {
    valid: true,
    jwtShopId,
    activeShopId,
  };
}

export function assertJwtShopConsistency(
  token: string | null,
  activeShopId: string | null
): void {
  const result = verifyJwtShopConsistency(token, activeShopId);
  if (!result.valid) {
    throw new SessionInconsistencyError(
      result.error || 'JWT and active shop are inconsistent.',
      result.jwtShopId,
      result.activeShopId
    );
  }
}

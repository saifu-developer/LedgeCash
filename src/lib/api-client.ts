import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getSecureAuthToken, setSecureAuthToken } from '@/lib/secure-storage';

const STORAGE_KEY_API_URL = 'cashmanager_api_base_url';

function getDefaultBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    // 10.0.2.2 maps to host machine localhost on standard Android Emulator
    return 'http://10.0.2.2:8080';
  }
  return 'http://localhost:8080';
}

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken !== null) {
    return cachedToken;
  }
  const token = await getSecureAuthToken();
  cachedToken = token;
  return token;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  await setSecureAuthToken(token);
}

export async function getApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl !== null) {
    return cachedBaseUrl;
  }
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
    if (stored) {
      cachedBaseUrl = stored;
      return stored;
    }
  } catch {
    // Fall back to default
  }
  cachedBaseUrl = getDefaultBaseUrl();
  return cachedBaseUrl;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const sanitized = url.replace(/\/+$/, '');
  cachedBaseUrl = sanitized;
  try {
    await AsyncStorage.setItem(STORAGE_KEY_API_URL, sanitized);
  } catch {
    // Ignore storage errors
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiClient<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();

  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }

    if (response.status === 204) {
      return null as T;
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage =
        data && typeof data === 'object' && 'message' in data
          ? String(data.message)
          : `HTTP ${response.status}: ${response.statusText}`;
      throw new ApiError(errorMessage, response.status, data);
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError('Network request timed out. Please check your connection.', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network request failed', 0, error);
  }
}

/* ====================================================================
   MULTI-SHOP BACKEND API METHODS (PHASE 3.1)
   ==================================================================== */

export interface OwnerLoginRequest {
  phone: string;
  pin: string;
}

export interface CloudShopDto {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface OwnerLoginResponse {
  token: string;
  tokenType: string;
  userId: string;
  name: string;
  phone: string;
  role: 'OWNER' | 'WORKER';
  activeShopId: string;
  activeShopName: string;
  shops: CloudShopDto[];
}

export interface SwitchShopRequest {
  shopId: string;
}

export interface SwitchShopResponse {
  token: string;
  tokenType: string;
  userId: string;
  name: string;
  phone: string;
  shopId: string;
  shopName: string;
  role: 'OWNER' | 'WORKER';
}

export interface CreateShopRequest {
  name: string;
}

/**
 * Authenticates an OWNER with phone + PIN against the multi-shop endpoint.
 * Returns JWT, owner identity, initial server-selected active shop, and owned shops.
 */
export async function loginOwnerApi(request: OwnerLoginRequest): Promise<OwnerLoginResponse> {
  return apiClient<OwnerLoginResponse>('/api/v1/auth/owner-login', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Switches the active shop for the authenticated owner on the backend.
 * Returns a new shop-scoped JWT.
 */
export async function switchShopApi(request: SwitchShopRequest): Promise<SwitchShopResponse> {
  return apiClient<SwitchShopResponse>('/api/v1/auth/switch-shop', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Creates an additional shop for the authenticated owner.
 * Does NOT send ownerId (the backend extracts owner from the JWT).
 */
export async function createShopApi(request: CreateShopRequest): Promise<CloudShopDto> {
  return apiClient<CloudShopDto>('/api/v1/shops', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Retrieves all shops owned by the authenticated owner from the backend.
 */
export async function getOwnedShopsApi(): Promise<CloudShopDto[]> {
  return apiClient<CloudShopDto[]>('/api/v1/shops', {
    method: 'GET',
  });
}


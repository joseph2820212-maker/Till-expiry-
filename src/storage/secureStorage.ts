/**
 * secureStorage.ts
 *
 * Thin wrapper around expo-secure-store for sensitive values.
 * All other app state stays in AsyncStorage.
 *
 * Exported as a plain object so tests can swap it out with a simple mock.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Prefix for AsyncStorage fallback keys used when native SecureStore is not
// reliable on the current device/runtime. The app still tries SecureStore first,
// but setup must not leave the user blocked.
const FB = 'secure_fallback:';

function allowAsyncStorageFallback(): boolean {
  // Dev-only. In production builds (__DEV__ === false) SecureStore is the ONLY
  // source of truth. Expo Go / simulators without a secure enclave still need the
  // fallback for development, hence the __DEV__ gate.
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

async function getFallback(key: string): Promise<string | null> {
  if (!allowAsyncStorageFallback()) return null;
  try { return await AsyncStorage.getItem(FB + key); } catch { return null; }
}

export interface SecureStorageAdapter {
  get(key: string): Promise<string | null>;
  getStrict(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const secureStorage: SecureStorageAdapter = {
  async get(key: string): Promise<string | null> {
    try {
      const val = await SecureStore.getItemAsync(key);
      if (val !== null) return val;
      return getFallback(key);
    } catch {
      return getFallback(key);
    }
  },
  async getStrict(key: string): Promise<string | null> {
    // Like get(), but a SecureStore READ ERROR is rethrown instead of being
    // masked as null. A genuine null (no value) is still returned.
    const val = await SecureStore.getItemAsync(key); // may throw — caller handles
    if (val !== null) return val;
    return getFallback(key);
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
      if (allowAsyncStorageFallback()) {
        AsyncStorage.removeItem(FB + key).catch(() => {});
      }
    } catch (err) {
      if (!allowAsyncStorageFallback()) throw err;
      await AsyncStorage.setItem(FB + key, value);
    }
  },
  async delete(key: string): Promise<void> {
    try { await SecureStore.deleteItemAsync(key); } catch {}
    try { await AsyncStorage.removeItem(FB + key); } catch {}
  },
};

// expo-secure-store only allows [A-Za-z0-9._-] in key names — no colons.
export const SECURE_KEYS = {
  INSTALLATION_ID: 'secure_installation_id',
} as const;

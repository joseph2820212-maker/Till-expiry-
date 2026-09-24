/**
 * Real vs demo data scope (§21, §27). Adapted from Till Note's demoAsyncStorage idea (`6fa6e941`
 * src/storage/demoAsyncStorage.ts): while the demo is active every business key is redirected to its own physical
 * namespace. TillExpiry uses the simple, fixed `demo:` prefix, which the backup allowlist excludes, so demo records can
 * never be read, written, backed up or restored as real ones (T65–T66).
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_KEYS } from './keys';

export type DataScope = 'real' | 'demo';

let scope: DataScope = 'real';
const listeners = new Set<() => void>();

export function getScope(): DataScope { return scope; }

/** Physical key for a logical business key in the current scope. Device keys (app:, journal:) pass through. */
export function phys(logical: string, s: DataScope = scope): string {
  if (logical.startsWith('app:') || logical.startsWith('journal:') || logical.startsWith('backup:')) return logical;
  return s === 'demo' ? `demo:${logical}` : logical;
}

export async function loadScope(): Promise<DataScope> {
  try { scope = (await AsyncStorage.getItem(DEVICE_KEYS.scope)) === 'demo' ? 'demo' : 'real'; } catch { scope = 'real'; }
  return scope;
}

export async function setScope(next: DataScope): Promise<void> {
  await AsyncStorage.setItem(DEVICE_KEYS.scope, next);
  scope = next;
  listeners.forEach(l => { try { l(); } catch { /* listener errors never block a scope change */ } });
}

export function onScopeChanged(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Re-render when the app switches between real data and the demo. */
export function useScope(): DataScope {
  return useSyncExternalStore(onScopeChanged, getScope, getScope);
}

/** Test helper. */
export function __setScopeForTests(s: DataScope): void { scope = s; }

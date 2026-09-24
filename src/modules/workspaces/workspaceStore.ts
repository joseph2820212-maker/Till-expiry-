/**
 * Workspaces (§21): several businesses on one phone, exactly one active. Every record carries its workspaceId and
 * every query is scoped to the active workspace, so switching can never show another business's data (T27–T31).
 * A workspace is hidden (archived), never hard-deleted; a hidden workspace can never stay active.
 * Adapted from Till Note's active-shop resolver idea (`6fa6e941`, dailyBook getActiveShop / GlobalShopSwitcher):
 * the stored active id is validated against the real list on every read.
 */
import { useSyncExternalStore } from 'react';
import type { Workspace, WorkspaceMode } from '../../domain/expiry/expiryTypes';
import { isValidTimeZone, deviceTimeZone } from '../../domain/expiry/datePrecision';
import { K } from '../../storage/keys';
import { newId, nowIso, readRecord, runTxn } from '../../storage/entityStore';
import { DomainError, cleanText } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';
import { onScopeChanged } from '../../storage/scope';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { phys } from '../../storage/scope';

export const WORKSPACE_MODES: readonly WorkspaceMode[] = ['retail', 'food_prep', 'mixed', 'home_other'] as const;
export const WORKSPACE_NAME_MAX = 60;

export interface WorkspaceDraft { name: string; mode: WorkspaceMode; currency?: string; timeZone?: string }

function validate(d: WorkspaceDraft): { name: string; mode: WorkspaceMode; currency: string; timeZone: string } {
  const name = cleanText(d.name);
  if (!name) throw new DomainError('workspaceNameRequired');
  if ([...name].length > WORKSPACE_NAME_MAX) throw new DomainError('textTooLong');
  if (!WORKSPACE_MODES.includes(d.mode)) throw new DomainError('badMode');
  const currency = (d.currency ?? '').toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new DomainError('badCurrency');
  const timeZone = d.timeZone || deviceTimeZone();
  if (!isValidTimeZone(timeZone)) throw new DomainError('badTimeZone');
  return { name, mode: d.mode, currency, timeZone };
}

/** Lenient display list. */
export async function listWorkspaces(opts: { includeHidden?: boolean } = {}): Promise<Workspace[]> {
  const raw = await AsyncStorage.getItem(phys(K.workspacesIndex));
  let ids: string[] = [];
  try { const v = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) ids = v; } catch { ids = []; }
  if (!ids.length) return [];
  const pairs = await AsyncStorage.multiGet(ids.map(id => phys(K.workspace(id))));
  const out: Workspace[] = [];
  for (const [, v] of pairs) { try { const w = v ? JSON.parse(v) : null; if (w?.id) out.push(w); } catch { /* skipped */ } }
  return out.filter(w => opts.includeHidden || w.status === 'active');
}

let active: Workspace | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Resolve (and repair) the active workspace: a stale or hidden active id falls back to the default / first active one. */
export async function loadActiveWorkspace(): Promise<Workspace | null> {
  const list = await listWorkspaces();
  const id = await readRecord<string>(K.workspacesActive);
  active = list.find(w => w.id === id) ?? list.find(w => w.isDefault) ?? list[0] ?? null;
  emit();
  return active;
}

export function getActiveWorkspace(): Workspace | null { return active; }

/** The active workspace id; throws if there is none (screens behind onboarding only). */
export function activeWorkspaceId(): string {
  if (!active) throw new DomainError('noWorkspace');
  return active.id;
}

export function subscribeWorkspace(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useActiveWorkspace(): Workspace | null {
  return useSyncExternalStore(subscribeWorkspace, getActiveWorkspace, getActiveWorkspace);
}

onScopeChanged(() => { loadActiveWorkspace().catch(() => undefined); });

export async function createWorkspace(d: WorkspaceDraft, opts: { makeActive?: boolean } = {}): Promise<Workspace> {
  const v = validate(d);
  const ws = await runTxn(async tx => {
    const ids = await tx.getIndex(K.workspacesIndex);
    const now = nowIso();
    const w: Workspace = { id: newId('ws'), ...v, status: 'active', isDefault: ids.length === 0, createdAt: now, updatedAt: now };
    tx.set(K.workspace(w.id), w);
    tx.set(K.workspacesIndex, [...ids, w.id]);
    if (opts.makeActive !== false || ids.length === 0) tx.set(K.workspacesActive, w.id);
    return w;
  });
  await loadActiveWorkspace();
  notifyDataChanged();
  return ws;
}

export async function updateWorkspace(id: string, d: WorkspaceDraft): Promise<Workspace> {
  const v = validate(d);
  const ws = await runTxn(async tx => {
    const w = await tx.get<Workspace>(K.workspace(id));
    if (!w) throw new DomainError('notFound');
    const next: Workspace = { ...w, ...v, updatedAt: nowIso() };
    tx.set(K.workspace(id), next);
    return next;
  });
  await loadActiveWorkspace();
  notifyDataChanged();
  return ws;
}

export async function setActiveWorkspace(id: string): Promise<Workspace> {
  const ws = await runTxn(async tx => {
    const w = await tx.get<Workspace>(K.workspace(id));
    if (!w) throw new DomainError('notFound');
    if (w.status !== 'active') throw new DomainError('workspaceHidden');
    tx.set(K.workspacesActive, id);
    return w;
  });
  await loadActiveWorkspace();
  notifyDataChanged();
  return ws;
}

/** Hide (archive) a workspace. Its data is kept. The last active workspace cannot be hidden. */
export async function hideWorkspace(id: string): Promise<void> {
  await runTxn(async tx => {
    const ids = await tx.getIndex(K.workspacesIndex);
    const all: Workspace[] = [];
    for (const wid of ids) { const w = await tx.get<Workspace>(K.workspace(wid)); if (w) all.push(w); }
    const w = all.find(x => x.id === id);
    if (!w) throw new DomainError('notFound');
    const others = all.filter(x => x.id !== id && x.status === 'active');
    if (!others.length) throw new DomainError('lastWorkspace');
    const now = nowIso();
    tx.set(K.workspace(id), { ...w, status: 'hidden', isDefault: false, updatedAt: now });
    if (w.isDefault) tx.set(K.workspace(others[0].id), { ...others[0], isDefault: true, updatedAt: now });
    const activeId = await tx.get<string>(K.workspacesActive);
    if (activeId === id || !activeId) tx.set(K.workspacesActive, others[0].id);
  });
  await loadActiveWorkspace();
  notifyDataChanged();
}

export async function restoreWorkspace(id: string): Promise<void> {
  await runTxn(async tx => {
    const w = await tx.get<Workspace>(K.workspace(id));
    if (!w) throw new DomainError('notFound');
    tx.set(K.workspace(id), { ...w, status: 'active', updatedAt: nowIso() });
  });
  await loadActiveWorkspace();
  notifyDataChanged();
}

/** Test helper. */
export function __resetWorkspaceCache(): void { active = null; emit(); }

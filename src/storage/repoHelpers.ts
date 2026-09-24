/** Shared helpers for the TillExpiry repositories. */
import { K, type EntityNs } from './keys';
import type { Txn } from './entityStore';

/** A domain rule was broken; `code` is a stable i18n suffix (errors.<code>). Nothing was written. */
export class DomainError extends Error {
  constructor(public readonly code: string, public readonly detail?: string) { super(code); this.name = 'DomainError'; }
}

export async function putRecord<T extends { id: string; workspaceId: string }>(tx: Txn, ns: EntityNs, rec: T): Promise<void> {
  tx.set(K.item(ns, rec.id), rec);
  await tx.addToIndex(K.index(ns, rec.workspaceId), rec.id);
}

/** Strict read of a record that must exist and belong to the workspace. */
export async function mustGet<T extends { workspaceId: string }>(tx: Txn, ns: EntityNs, id: string, workspaceId: string, code = 'notFound'): Promise<T> {
  const r = await tx.get<T>(K.item(ns, id));
  if (!r || r.workspaceId !== workspaceId) throw new DomainError(code);
  return r;
}

export const cleanText = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
export const optText = (s?: string | null, max = 200): string | undefined => {
  const c = cleanText(s);
  if ([...c].length > max) throw new DomainError('textTooLong');
  return c || undefined;
};

export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

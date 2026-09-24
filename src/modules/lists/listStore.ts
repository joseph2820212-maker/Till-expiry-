/**
 * Categories and suppliers per workspace. Adapted from Till Note's business-lists pattern (`6fa6e941`
 * src/modules/businessLists/storage/businessListsStorage.ts): hide, never delete; names are the user's own.
 */
import type { BusinessListItem } from '../../domain/expiry/expiryTypes';
import { K } from '../../storage/keys';
import { listRecords, newId, nowIso, runTxn, type Txn } from '../../storage/entityStore';
import { DomainError, cleanText, foldText, mustGet, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';

export type ListKind = BusinessListItem['kind'];

export async function listItems(workspaceId: string, kind: ListKind, opts: { includeHidden?: boolean } = {}): Promise<BusinessListItem[]> {
  const { items } = await listRecords<BusinessListItem>('lists', workspaceId);
  return items.filter(i => i.workspaceId === workspaceId && i.kind === kind && (opts.includeHidden || i.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
}

/** Inside a transaction: find an item by name (case / accent-insensitive) or create it. Used by product save and import. */
export async function ensureListItemTx(tx: Txn, workspaceId: string, kind: ListKind, rawName: string): Promise<BusinessListItem> {
  const name = cleanText(rawName);
  if (!name) throw new DomainError('nameRequired');
  if ([...name].length > 40) throw new DomainError('textTooLong');
  const ids = await tx.getIndex(K.index('lists', workspaceId));
  for (const id of ids) {
    const it = await tx.get<BusinessListItem>(K.item('lists', id));
    if (it && it.kind === kind && foldText(it.name) === foldText(name)) {
      if (it.status !== 'active') tx.set(K.item('lists', id), { ...it, status: 'active', updatedAt: nowIso() });
      return it;
    }
  }
  const now = nowIso();
  const rec: BusinessListItem = { id: newId(kind === 'category' ? 'cat' : 'sup'), workspaceId, kind, name, status: 'active', createdAt: now, updatedAt: now };
  await putRecord(tx, 'lists', rec);
  return rec;
}

export async function addListItem(workspaceId: string, kind: ListKind, name: string): Promise<BusinessListItem> {
  const r = await runTxn(tx => ensureListItemTx(tx, workspaceId, kind, name));
  notifyDataChanged();
  return r;
}

export async function setListItemHidden(workspaceId: string, id: string, hidden: boolean): Promise<void> {
  await runTxn(async tx => {
    const it = await mustGet<BusinessListItem>(tx, 'lists', id, workspaceId);
    tx.set(K.item('lists', id), { ...it, status: hidden ? 'hidden' : 'active', updatedAt: nowIso() });
  });
  notifyDataChanged();
}

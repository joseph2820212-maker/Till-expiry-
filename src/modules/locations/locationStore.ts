/** Storage locations (§7.6): fridges, freezers, shelves… Hidden, never deleted. Moving a batch never changes its date. */
import type { LocationKind, StorageLocation } from '../../domain/expiry/expiryTypes';
import { LOCATION_KINDS } from '../../domain/expiry/expiryTypes';
import { K } from '../../storage/keys';
import { listRecords, newId, nowIso, runTxn } from '../../storage/entityStore';
import { DomainError, cleanText, mustGet, optText, putRecord } from '../../storage/repoHelpers';
import { notifyDataChanged } from '../../storage/changeBus';

export interface LocationDraft { name: string; kind: LocationKind; notes?: string }

function validate(d: LocationDraft) {
  const name = cleanText(d.name);
  if (!name) throw new DomainError('nameRequired');
  if ([...name].length > 40) throw new DomainError('textTooLong');
  if (!LOCATION_KINDS.includes(d.kind)) throw new DomainError('badLocationKind');
  return { name, kind: d.kind, notes: optText(d.notes, 200) };
}

export async function saveLocation(workspaceId: string, d: LocationDraft, id?: string): Promise<StorageLocation> {
  const v = validate(d);
  const loc = await runTxn(async tx => {
    const now = nowIso();
    if (id) {
      const existing = await mustGet<StorageLocation>(tx, 'locations', id, workspaceId);
      const next = { ...existing, ...v, updatedAt: now };
      tx.set(K.item('locations', id), next);
      return next;
    }
    const rec: StorageLocation = { id: newId('loc'), workspaceId, ...v, status: 'active', createdAt: now, updatedAt: now };
    await putRecord(tx, 'locations', rec);
    return rec;
  });
  notifyDataChanged();
  return loc;
}

export async function setLocationHidden(workspaceId: string, id: string, hidden: boolean): Promise<void> {
  await runTxn(async tx => {
    const l = await mustGet<StorageLocation>(tx, 'locations', id, workspaceId);
    tx.set(K.item('locations', id), { ...l, status: hidden ? 'hidden' : 'active', updatedAt: nowIso() });
  });
  notifyDataChanged();
}

export async function listLocations(workspaceId: string, opts: { includeHidden?: boolean } = {}): Promise<StorageLocation[]> {
  const { items } = await listRecords<StorageLocation>('locations', workspaceId);
  return items.filter(l => l.workspaceId === workspaceId && (opts.includeHidden || l.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One read of the active workspace for the work screens (Today, queue, check round, items): active batches ranked by
 * urgency, plus the names needed to show them. Everything is filtered by workspace id at the store level, so a switch
 * can never show another business's records (T29).
 */
import type { Batch, Product, StorageLocation, Workspace } from '../../domain/expiry/expiryTypes';
import { groupOf, type StatusGroup } from '../../domain/expiry/statusEngine';
import { rankBatches, type Ranked } from '../../domain/expiry/expirySort';
import { listBatches } from '../batches/batchStore';
import { listProducts } from '../products/productStore';
import { listLocations } from '../locations/locationStore';
import { getGeneral } from '../settings/settingsStore';
import type { BatchQuery } from '../../navigation/AppNavigator';

export interface WorkspaceView {
  workspace: Workspace;
  now: number;
  ranked: Ranked[];
  products: Map<string, Product>;
  locations: StorageLocation[];
  locationName: (id?: string) => string | undefined;
  counts: Record<StatusGroup, number>;
}

export const SUMMARY_GROUPS: StatusGroup[] = ['past_hard', 'due_today', 'due_soon', 'needs_checking', 'quality_review'];
/** Groups that need someone to act or look today (§13 "next actions"). */
export const ATTENTION_GROUPS: StatusGroup[] = ['past_hard', 'due_today', 'due_soon', 'needs_checking', 'quality_review'];

export async function loadWorkspaceView(workspace: Workspace, now: number = Date.now()): Promise<WorkspaceView> {
  const [batches, products, locations] = await Promise.all([
    listBatches(workspace.id), listProducts(workspace.id, { includeHidden: true }), listLocations(workspace.id, { includeHidden: true }),
  ]);
  const ranked = rankBatches(batches, now, getGeneral());
  const counts: Record<StatusGroup, number> = { past_hard: 0, due_today: 0, due_soon: 0, needs_checking: 0, quality_review: 0, later: 0 };
  for (const r of ranked) counts[groupOf(r.evaluation.status)]++;
  const names = new Map(locations.map(l => [l.id, l.name]));
  return {
    workspace, now, ranked, locations: locations.filter(l => l.status === 'active'),
    products: new Map(products.map(p => [p.id, p])),
    locationName: id => (id ? names.get(id) : undefined),
    counts,
  };
}

export function matchesQuery(r: Ranked, q: BatchQuery | undefined): boolean {
  if (!q) return true;
  const g = groupOf(r.evaluation.status);
  if (q.group === 'attention' ? !ATTENTION_GROUPS.includes(g) : q.group && g !== q.group) return false;
  if (q.locationId && r.batch.locationId !== q.locationId) return false;
  if (q.kind && r.batch.kind !== q.kind) return false;
  return true;
}

export function filterRanked(v: WorkspaceView, q: BatchQuery | undefined): Ranked[] {
  return v.ranked.filter(r => matchesQuery(r, q));
}

/** The one primary action a card offers (§13): look at it, or record that it was dealt with. */
export function primaryActionFor(b: Batch, group: StatusGroup): 'remove' | 'review' | 'check' | 'open' {
  if (group === 'past_hard') return 'remove';
  if (group === 'quality_review') return 'review';
  if (group === 'needs_checking') return 'check';
  return 'open';
}

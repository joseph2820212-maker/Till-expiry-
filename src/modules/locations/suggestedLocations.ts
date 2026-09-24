/** Optional starter places for a new workspace. Only names and kinds — never any date or shelf-life rule. */
import type { LocationKind, WorkspaceMode } from '../../domain/expiry/expiryTypes';
import { saveLocation } from './locationStore';

type T = (k: string) => string;

export function suggestedLocations(mode: WorkspaceMode): LocationKind[] {
  switch (mode) {
    case 'retail': return ['shelf', 'fridge', 'freezer', 'display'];
    case 'food_prep': return ['prep', 'fridge', 'freezer', 'cupboard'];
    case 'mixed': return ['shelf', 'fridge', 'freezer', 'prep', 'display'];
    default: return ['fridge', 'freezer', 'cupboard'];
  }
}

export async function addSuggestedLocations(workspaceId: string, mode: WorkspaceMode, t: T): Promise<void> {
  for (const kind of suggestedLocations(mode)) await saveLocation(workspaceId, { name: t(`locationKind.${kind}`), kind });
}

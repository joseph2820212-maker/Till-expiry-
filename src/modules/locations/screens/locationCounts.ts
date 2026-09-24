/** Active batches per location id. */
export function countByLocation(batches: { locationId?: string; status: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of batches) if (b.status === 'active' && b.locationId) m.set(b.locationId, (m.get(b.locationId) ?? 0) + 1);
  return m;
}

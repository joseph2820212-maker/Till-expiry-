/**
 * Tiny in-memory hand-off from the scanner to the screen that asked for a
 * barcode (carried over from TillCalc). Navigation params stay serialisable, so
 * the asking screen reads its result on focus instead of receiving a callback.
 * Nothing is persisted; a cold start simply has nothing pending.
 */
export type ScanTarget = 'product' | 'date';

interface Pending { code: string; symbology: string; at: number }

const pending = new Map<ScanTarget, Pending>();

export function setPendingScan(target: ScanTarget, code: string, symbology = 'unknown'): void {
  pending.set(target, { code, symbology, at: Date.now() });
}

export function takePendingScan(target: ScanTarget): Pending | null {
  const p = pending.get(target) ?? null;
  pending.delete(target);
  return p;
}

export function clearPendingScans(): void {
  pending.clear();
}

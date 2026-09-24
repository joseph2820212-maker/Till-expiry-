/**
 * "Data changed" signal. Repositories call `notifyDataChanged()` after every committed transaction; the reminder
 * reconciler and open screens listen. In-memory only.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function notifyDataChanged(): void {
  version++;
  listeners.forEach(l => { try { l(); } catch { /* a listener must never break a save */ } });
}

export function onDataChanged(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function dataVersion(): number { return version; }

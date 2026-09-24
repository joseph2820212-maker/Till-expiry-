/**
 * "Dates changed" signal. Stores call `notifyDataChanged()` after every committed write; the reminder planner
 * listens so tomorrow's reminder always counts what is really on the shelf. In-memory only.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyDataChanged(): void {
  listeners.forEach(l => { try { l(); } catch { /* a listener must never break a save */ } });
}

export function onDataChanged(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

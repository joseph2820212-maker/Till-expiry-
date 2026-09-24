/**
 * A Txn wrapper for bulk writes (the CSV import). The store helpers (putRecord, appendEvent, ensureListItemTx) append
 * ids to indexes one at a time; on the plain Txn every append re-parses and re-serialises the whole index, which is
 * quadratic for a 5,000-row file. This wrapper keeps each touched index in memory (array + Set) and writes it once in
 * `flush()`. Reads of a buffered index see the buffered value, so the helpers behave exactly as on the plain Txn.
 * Everything still goes through the same journaled transaction: nothing is written unless the whole import commits.
 */
import type { Txn } from '../../storage/entityStore';

interface Buf { list: string[]; set: Set<string>; dirty: boolean }

export class BufferedIndexTxn implements Txn {
  private readonly bufs = new Map<string, Buf>();
  constructor(private readonly inner: Txn) {}

  private async buf(key: string): Promise<Buf> {
    let b = this.bufs.get(key);
    if (!b) {
      const list = await this.inner.getIndex(key);
      b = { list: [...list], set: new Set(list), dirty: false };
      this.bufs.set(key, b);
    }
    return b;
  }

  async get<T>(key: string): Promise<T | null> {
    const b = this.bufs.get(key);
    if (b) return [...b.list] as unknown as T;
    return this.inner.get<T>(key);
  }
  async getIndex(key: string): Promise<string[]> {
    return [...(await this.buf(key)).list];
  }
  set(key: string, value: unknown): void {
    this.bufs.delete(key);
    this.inner.set(key, value);
  }
  del(key: string): void {
    this.bufs.delete(key);
    this.inner.del(key);
  }
  async addToIndex(key: string, id: string): Promise<void> {
    const b = await this.buf(key);
    if (b.set.has(id)) return;
    b.set.add(id);
    b.list.push(id);
    b.dirty = true;
  }
  async removeFromIndex(key: string, id: string): Promise<void> {
    const b = await this.buf(key);
    if (!b.set.has(id)) return;
    b.set.delete(id);
    b.list = b.list.filter(x => x !== id);
    b.dirty = true;
  }
  /** Write every changed index into the underlying transaction (call once, at the end of the transaction body). */
  flush(): void {
    for (const [key, b] of this.bufs) if (b.dirty) { this.inner.set(key, b.list); b.dirty = false; }
  }
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Stable, collision-resistant local ids: `<prefix>_<time>_<random>`. */
export const makeId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${rand()}`;
export const makeRevision = (): string => makeId('rev');
export const nowIso = (): string => new Date().toISOString();

/** djb2 over a string: cheap corruption check for journals. Not a security hash (use SHA-256 for files). */
export function checksum(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return h >>> 0;
}
